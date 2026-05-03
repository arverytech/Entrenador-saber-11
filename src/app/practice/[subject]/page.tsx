
"use client";

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, BrainCircuit, ArrowRight, Loader2, Wand2, GraduationCap, XCircle, ShieldCheck, Zap, BookX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { doc, increment, collection, addDoc, getDocs, serverTimestamp, query, where, orderBy, limit, updateDoc } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import type { DynamicAnswerExplanationOutput } from '@/ai/flows/dynamic-answer-explanations-flow';
import { generateIcfesQuestion, type GenerateQuestionOutput } from '@/ai/flows/generate-question-flow';

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const { user, firestore, isUserLoading } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();
  const currentSubject = params.subject.toLowerCase();

  // Debug panel: visible only when URL contains ?debug=1
  const [showDebug, setShowDebug] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShowDebug(new URLSearchParams(window.location.search).get('debug') === '1');
    }
  }, []);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  // Prefer schemaVersion=2 questions; fall back to all questions for this subject
  const v2QuestionsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'questions'),
      where('subjectId', '==', currentSubject),
      where('schemaVersion', '==', 2),
      where('deprecated', '!=', true),
      limit(20),
    );
  }, [firestore, currentSubject]);

  const legacyQuestionsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'questions'),
      where('subjectId', '==', currentSubject),
      where('deprecated', '!=', true),
      limit(20),
    );
  }, [firestore, currentSubject]);

  const { data: v2Questions, isLoading: isV2Loading } = useCollection(v2QuestionsQuery);
  const { data: legacyQuestions, isLoading: isLegacyLoading, error: dbError } = useCollection(legacyQuestionsQuery);

  const isDbLoading = isV2Loading || isLegacyLoading;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiGenerationError, setAiGenerationError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<DynamicAnswerExplanationOutput | null>(null);
  const [genQuestion, setGenQuestion] = useState<GenerateQuestionOutput | null>(null);

  const activeQuestions = useMemo(() => {
    // Prefer v2 questions when available; fall back to legacy (unversioned) if fewer than 5
    const v2 = v2Questions ?? [];
    if (v2.length >= 5) return v2;
    // Merge: v2 first, then legacy ones not already in v2
    const v2Ids = new Set(v2.map((q: Record<string, unknown>) => q.id));
    const legacy = (legacyQuestions ?? []).filter((q: Record<string, unknown>) => !v2Ids.has(q.id));
    return [...v2, ...legacy];
  }, [v2Questions, legacyQuestions]);

  const currentQ = useMemo(() => {
    if (genQuestion) return genQuestion;
    if (activeQuestions.length > 0 && currentIdx < activeQuestions.length) {
      return activeQuestions[currentIdx];
    }
    return null;
  }, [activeQuestions, currentIdx, genQuestion]);

  // Returns true when the error looks like a Gemini quota/rate-limit error (429).
  const is429Error = (e: unknown): boolean => {
    if (!(e instanceof Error)) return false;
    const msg = e.message.toLowerCase();
    return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
  };

  // Sanitize an error message so it never leaks secrets or full stack traces.
  const sanitizeErrorMsg = (msg: string): string =>
    msg.replace(/[^\w\s:/().,-]/g, '').slice(0, 200);

  // Manual AI generation – only triggered by explicit user action, never automatically.
  const handleManualGenerate = async () => {
    setAiGenerationError(null);
    setIsGenerating(true);
    try {
      const result = await generateIcfesQuestion({
        subject: currentSubject,
        component: "General",
        competency: "Resolución de problemas",
        level: "Medio",
      });
      setGenQuestion(result);

      // Save the AI-generated question to Firestore so the bank grows organically.
      if (user && firestore) {
        const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `ai_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        await addDoc(collection(firestore, 'questions'), {
          text: result.text,
          options: result.options,
          correctAnswerIndex: result.correctAnswerIndex,
          explanation: result.explanation,
          subjectId: result.subjectId,
          componentId: result.componentId,
          competencyId: result.competencyId,
          level: result.level,
          pointsAwarded: result.pointsAwarded,
          ...(result.svgData ? { svgData: result.svgData } : {}),
          ...(result.aiXml ? { aiXml: result.aiXml } : {}),
          metadata: result.metadata,
          schemaVersion: 2,
          source: 'icfes_ai_v2',
          importedAt: serverTimestamp(),
          importedBy: user.uid,
          sessionId,
          importSessionId: sessionId,
        });

        // Gradual replacement: mark one older (non-v2) question for the same subject
        // as deprecated so it gradually disappears from practice.
        try {
          const oldQ = await getDocs(
            query(
              collection(firestore, 'questions'),
              where('subjectId', '==', result.subjectId),
              where('schemaVersion', '!=', 2),
              limit(1),
            )
          );
          if (!oldQ.empty) {
            await updateDoc(oldQ.docs[0].ref, { deprecated: true });
          }
        } catch {
          // Non-fatal: best-effort deprecation
        }
      }
    } catch (e: unknown) {
      const rawMsg = e instanceof Error ? e.message : 'Error desconocido';
      const safeMsg = sanitizeErrorMsg(rawMsg);
      if (is429Error(e)) {
        const quotaMsg = 'La cuota de la API de IA está agotada. Intenta de nuevo más tarde.';
        setAiGenerationError(quotaMsg);
        toast({ variant: 'destructive', title: 'Cuota de IA agotada (429)', description: quotaMsg });
      } else {
        setAiGenerationError(`La IA no pudo generar una pregunta. Detalle: ${safeMsg}`);
        toast({ variant: 'destructive', title: 'Error al generar pregunta IA', description: 'Verifica la API Key de Gemini en la configuración del servidor.' });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCheck = async () => {
    if (selected === null || !currentQ) return;
    const correctIdx = currentQ.correctAnswerIndex;
    const correct = selected === correctIdx;
    setIsCorrect(correct);

    if (correct) {
      toast({ title: "¡Excelente!", description: "+50 XP sumados." });
      if (user && firestore) {
        updateDocumentNonBlocking(doc(firestore, 'users', user.uid), { 
          currentPoints: increment(50), 
          updatedAt: serverTimestamp() 
        });
      }
    }

    if (user && firestore) {
      addDoc(collection(firestore, 'users', user.uid, 'quizAttempts'), {
        questionId: currentQ.id,
        subject: currentSubject,
        isCorrect: correct,
        selectedAnswer: selected,
        timestamp: serverTimestamp()
      });
    }
  };

  const handleAiAnalysis = async () => {
    if (selected === null || !currentQ) return;

    // If the question was imported with pre-generated explanations, use them instantly
    if (currentQ.aiExplanation) {
      setAiAnalysis(currentQ.aiExplanation as DynamicAnswerExplanationOutput);
      return;
    }

    setIsExplaining(true);
    try {
      const res = await fetch('/api/explain-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: currentQ.text,
          userAnswer: currentQ.options[selected],
          correctAnswer: currentQ.options[currentQ.correctAnswerIndex],
          options: currentQ.options,
          subject: currentSubject,
          component: currentQ.componentId || 'General',
          competency: currentQ.competencyId || 'Razonamiento',
          ...(currentQ.aiXml ? { aiXml: currentQ.aiXml } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 429) {
        toast({ variant: 'destructive', title: 'Cuota de IA agotada', description: 'La explicación no está disponible ahora. Intenta de nuevo más tarde.' });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || `Error del servidor: ${res.status}`);
      }
      setAiAnalysis(data.explanation);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast({ variant: "destructive", title: "Error de Explicación IA", description: msg });
    } finally {
      setIsExplaining(false);
    }
  };

  const handleNext = () => {
    const hadGenQuestion = !!genQuestion;
    setIsCorrect(null);
    setSelected(null);
    setAiAnalysis(null);
    setGenQuestion(null);
    setAiGenerationError(null);

    // Advance through the bank; if the AI question was just used, stay at current index
    // so currentQ becomes null and the empty-state UI is shown with the manual button.
    if (!hadGenQuestion) {
      setCurrentIdx(prev => prev + 1);
    }
  };

  if (isUserLoading || isDbLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="font-black uppercase tracking-widest text-[10px]">Preparando Entrenamiento...</p>
      </div>
    );
  }

  // Sanitized strings for diagnostic panel (no secrets exposed)
  const sanitizedDbError = dbError
    ? sanitizeErrorMsg((dbError as Error).message ?? 'Error desconocido')
    : null;
  const truncatedUid = user?.uid ? `${user.uid.slice(0, 8)}…` : null;
  const bankExhausted = !genQuestion && activeQuestions.length > 0 && currentIdx >= activeQuestions.length;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">

        {/* ── Diagnostic panel (visible only with ?debug=1) ─────────────────── */}
        {showDebug && (
          <div className="p-4 rounded-2xl border-2 border-yellow-400/40 bg-yellow-50/10 text-[10px] font-mono space-y-1">
            <p className="font-black uppercase text-yellow-500 text-xs mb-2">🔧 Panel de Diagnóstico (debug=1)</p>
            <p>Auth: {isUserLoading ? 'cargando…' : user ? `✅ uid=${truncatedUid}` : '❌ sin sesión'}</p>
            <p>Firestore: {firestore ? '✅ instancia OK' : '❌ no disponible'}</p>
            <p>Query: isDbLoading={String(isDbLoading)} | docs={dbQuestions?.length ?? 'null'}</p>
            {sanitizedDbError && <p className="text-destructive">Error Firestore: {sanitizedDbError}</p>}
            <p>AI: isGenerating={String(isGenerating)} | genQuestion={genQuestion ? 'sí' : 'no'}</p>
          </div>
        )}

        {/* ── Header bar ────────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Zap className="w-4 h-4 text-accent animate-pulse" />
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase text-muted-foreground leading-none mb-1">Entrenamiento Actual</p>
              <h2 className="text-xl font-black uppercase italic text-primary">{currentSubject}</h2>
            </div>
          </div>
          <div className="flex gap-4">
            <Badge variant="outline" className="text-[10px] uppercase font-black border-primary/20">{currentQ?.componentId || "General"}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-black border-primary/20">{currentQ?.competencyId || "Razonamiento"}</Badge>
          </div>
        </div>

        {/* ── Empty / exhausted state ───────────────────────────────────────── */}
        {!currentQ && !isGenerating && (
          <Card className="game-card border-primary/20 bg-card">
            <CardContent className="p-12 flex flex-col items-center text-center gap-6">
              <BookX className="w-16 h-16 text-muted-foreground/40" />
              <div className="space-y-2">
                <h3 className="text-xl font-black uppercase italic">
                  {sanitizedDbError
                    ? 'No se pudo leer Firestore'
                    : bankExhausted
                      ? 'Banco agotado'
                      : 'Banco vacío o no se pudo leer Firestore'}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {sanitizedDbError
                    ? `Error al conectar con la base de datos: ${sanitizedDbError}`
                    : bankExhausted
                      ? `Completaste las ${activeQuestions.length} preguntas del banco. Puedes generar una nueva con IA o volver más tarde.`
                      : 'No hay preguntas en el banco para esta materia. Genera una con IA o importa preguntas oficiales desde el Panel Admin.'}
                </p>
              </div>

              {aiGenerationError && (
                <div className="p-4 rounded-2xl border-2 border-destructive/30 bg-destructive/5 text-sm text-destructive font-bold w-full text-left space-y-2">
                  <p>{aiGenerationError}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    Para activar la IA: configura la variable de entorno <code>GOOGLE_GENAI_API_KEY</code> en el servidor.{' '}
                    Para cargar preguntas al banco: ve al <strong>Panel Admin → Cargar Preguntas Oficiales</strong>.
                  </p>
                </div>
              )}

              <div className="flex gap-4 flex-wrap justify-center">
                <Button
                  className="game-button bg-primary text-white h-12 px-8 shadow-lg glow-primary"
                  onClick={handleManualGenerate}
                  disabled={isGenerating}
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generar con IA
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-8 font-black uppercase text-[10px] tracking-widest"
                  onClick={() => router.push('/admin')}
                >
                  Panel Admin
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── AI generation in progress ─────────────────────────────────────── */}
        {!currentQ && isGenerating && (
          <Card className="game-card border-primary/20 bg-card">
            <CardContent className="p-12 flex flex-col items-center text-center gap-6">
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
              <p className="font-black uppercase tracking-widest text-sm">Generando pregunta ICFES con IA...</p>
            </CardContent>
          </Card>
        )}

        {/* ── Question + answer area ────────────────────────────────────────── */}
        {currentQ && (
          <div className="grid lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 game-card border-primary/20 bg-card">
              <div className="p-10 border-b-2 border-primary/5">
                <h2 className="text-2xl font-black uppercase italic leading-snug">
                  {currentQ.text}
                </h2>
                {currentQ.svgData && (
                  <div
                    className="mt-6 rounded-2xl overflow-hidden border border-primary/20 bg-muted/30 flex justify-center"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(currentQ.svgData, {
                        USE_PROFILES: { svg: true, svgFilters: true },
                      }),
                    }}
                  />
                )}
              </div>
              <CardContent className="p-10 space-y-4">
                {currentQ.options.map((opt: string, i: number) => (
                  <button
                    key={i}
                    disabled={isCorrect !== null}
                    onClick={() => setSelected(i)}
                    className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between
                      ${selected === i ? 'border-primary bg-primary/5' : 'border-muted hover:bg-muted/50'}
                      ${isCorrect && i === currentQ.correctAnswerIndex ? 'border-secondary bg-secondary/10' : ''}
                      ${isCorrect === false && selected === i ? 'border-destructive bg-destructive/10' : ''}
                    `}
                  >
                    <span className="italic">{opt}</span>
                    {isCorrect && i === currentQ.correctAnswerIndex && <CheckCircle2 className="text-secondary w-6 h-6" />}
                    {isCorrect === false && selected === i && <AlertCircle className="text-destructive w-6 h-6" />}
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-6">
              {isCorrect === null ? (
                <div className="p-10 rounded-3xl bg-card border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-center gap-6 min-h-[400px]">
                  <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Analiza la situación</p>
                    <h4 className="font-bold text-sm italic">"El conocimiento es tu mejor arma"</h4>
                  </div>
                  <Button className="game-button bg-primary w-full h-14 text-white shadow-lg glow-primary" disabled={selected === null} onClick={handleCheck}>
                    Confirmar Respuesta
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                  <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40 shadow-secondary/10' : 'border-destructive/40 shadow-destructive/10'} shadow-2xl`}>
                    <div className={`p-6 flex items-center gap-4 ${isCorrect ? 'bg-secondary/10' : 'bg-destructive/10'}`}>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isCorrect ? 'bg-secondary text-white shadow-lg' : 'bg-destructive text-white shadow-lg'}`}>
                        {isCorrect ? <ShieldCheck className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight italic">{isCorrect ? '¡Impacto Crítico!' : 'Escudo Roto'}</h3>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-60">{isCorrect ? '+50 Puntos de Experiencia' : 'Aprende del error para mejorar'}</p>
                      </div>
                    </div>

                    {!aiAnalysis ? (
                      <div className="p-6 space-y-4">
                        <Button className="w-full game-button bg-primary text-white h-12 shadow-md" onClick={handleAiAnalysis} disabled={isExplaining}>
                          {isExplaining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Generar Explicación Maestro IA"}
                        </Button>
                        <Button variant="ghost" className="w-full font-black uppercase text-[10px] tracking-widest" onClick={handleNext}>Omitir e ir a la Siguiente</Button>
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/20">
                        <Tabs defaultValue="solucion" className="w-full">
                          <TabsList className="grid w-full grid-cols-3 bg-background border-2 h-12">
                            <TabsTrigger value="planteamiento" className="text-[9px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white">Fase 1</TabsTrigger>
                            <TabsTrigger value="solucion" className="text-[9px] font-black uppercase data-[state=active]:bg-secondary data-[state=active]:text-white">Fase 2</TabsTrigger>
                            <TabsTrigger value="errores" className="text-[9px] font-black uppercase data-[state=active]:bg-destructive data-[state=active]:text-white">Fase 3</TabsTrigger>
                          </TabsList>

                          <TabsContent value="planteamiento" className="mt-4">
                            <div className="bg-background p-5 rounded-2xl border-l-8 border-primary shadow-inner">
                              <Badge className="bg-primary/10 text-primary mb-3 text-[8px] font-black">{aiAnalysis.slide1.metadata.origin}</Badge>
                              <h5 className="text-[10px] font-black uppercase mb-2 text-primary">Contexto Técnico</h5>
                              <p className="text-xs italic leading-relaxed text-muted-foreground">{aiAnalysis.slide1.contextSummary}</p>
                            </div>
                          </TabsContent>

                          <TabsContent value="solucion" className="mt-4">
                            <div className="bg-secondary/5 p-5 rounded-2xl border-l-8 border-secondary shadow-inner">
                              <h4 className="text-[10px] font-black uppercase text-secondary mb-4 flex items-center gap-2">
                                <GraduationCap className="w-4 h-4" /> Solución Paso a Paso
                              </h4>
                              <div className="space-y-4">
                                {aiAnalysis.slide2.stepByStep.map((step, i) => (
                                  <div key={i} className="flex gap-3 text-xs p-2 bg-white/50 rounded-lg">
                                    <span className="text-secondary font-black">{i + 1}.</span>
                                    <p className="font-medium">{step}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="errores" className="mt-4">
                            <div className="bg-destructive/5 p-5 rounded-2xl border-l-8 border-destructive shadow-inner">
                              <h4 className="text-[10px] font-black uppercase text-destructive mb-4">Análisis de Errores ICFES</h4>
                              <div className="space-y-3">
                                {aiAnalysis.slide3.distractors.map((dist, i) => (
                                  <div key={i} className="p-3 bg-white/80 rounded-xl border border-destructive/10">
                                    <p className="text-[9px] font-black uppercase text-destructive mb-1">Opción {dist.option}: {dist.errorType}</p>
                                    <p className="text-[9px] text-muted-foreground italic leading-tight">{dist.explanation}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                        <Button className="w-full game-button bg-primary text-white h-14 mt-4 shadow-xl glow-primary" onClick={handleNext}>
                          Siguiente Pregunta <ArrowRight className="ml-2 w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
