"use client";

import { useState, useMemo } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Timer, Zap, AlertCircle, CheckCircle2, BrainCircuit, ArrowRight, Loader2, Wand2, GraduationCap, XCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { doc, increment, collection, addDoc, serverTimestamp, query, where, limit } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { generateExplanation, type DynamicAnswerExplanationOutput } from '@/ai/flows/dynamic-answer-explanations-flow';
import { generateIcfesQuestion, type GenerateQuestionOutput } from '@/ai/flows/generate-question-flow';

const FALLBACK_QUESTIONS: Record<string, any[]> = {
  matematicas: [
    {
      id: "fallback_math_01",
      text: "¿Cuál es el valor de x en la ecuación 2x + 5 = 15?",
      options: ["A) 5", "B) 10", "C) 7.5", "D) 20"],
      correctAnswerIndex: 0,
      componentId: "Numérico-Variacional",
      competencyId: "Formulación y Ejecución",
      level: "Básico",
      explanation: "Despejando: 2x = 10, entonces x = 5."
    }
  ]
};

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const { user, firestore, isUserLoading } = useUser();
  const { toast } = useToast();
  const currentSubject = params.subject.toLowerCase();

  const questionsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'questions'), where('subjectId', '==', currentSubject), limit(15));
  }, [firestore, currentSubject]);

  const { data: dbQuestions, isLoading: isDbLoading } = useCollection(questionsQuery);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<DynamicAnswerExplanationOutput | null>(null);
  const [genQuestion, setGenQuestion] = useState<GenerateQuestionOutput | null>(null);

  const activeQuestions = useMemo(() => {
    if (dbQuestions && dbQuestions.length > 0) return dbQuestions;
    return FALLBACK_QUESTIONS[currentSubject] || FALLBACK_QUESTIONS['matematicas'];
  }, [dbQuestions, currentSubject]);

  const currentQ = useMemo(() => {
    if (genQuestion) return genQuestion;
    return activeQuestions[currentIdx % activeQuestions.length];
  }, [activeQuestions, currentIdx, genQuestion]);

  const handleCheck = async () => {
    if (selected === null) return;
    const correctIdx = currentQ.correctAnswerIndex ?? currentQ.correctIndex;
    const correct = selected === correctIdx;
    setIsCorrect(correct);

    if (correct) {
      toast({ title: "¡Victoria Académica!", description: "+50 XP sumados a tu perfil real." });
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
        timestamp: serverTimestamp(),
        component: currentQ.componentId || "General",
        competency: currentQ.competencyId || "Razonamiento"
      });
    }
  };

  const handleAiAnalysis = async () => {
    if (selected === null) return;
    setIsExplaining(true);
    try {
      const result = await generateExplanation({
        question: currentQ.text || currentQ.title,
        userAnswer: currentQ.options[selected],
        correctAnswer: currentQ.options[currentQ.correctAnswerIndex ?? currentQ.correctIndex],
        options: currentQ.options,
        subject: currentSubject,
        component: currentQ.componentId || "General",
        competency: currentQ.competencyId || "Razonamiento",
      });
      setAiAnalysis(result);
    } catch (e) {
      toast({ variant: "destructive", title: "IA Ocupada", description: "Verifica tu GOOGLE_GENAI_API_KEY en Vercel." });
    } finally {
      setIsExplaining(false);
    }
  };

  const handleNext = () => {
    setIsCorrect(null);
    setSelected(null);
    setAiAnalysis(null);
    setGenQuestion(null);
    setCurrentIdx(prev => prev + 1);
  };

  const handleGenerateAi = async () => {
    setIsGenerating(true);
    try {
      const result = await generateIcfesQuestion({
        subject: currentSubject,
        component: "Aleatorio",
        competency: "Formulación y Razonamiento",
        level: "Medio"
      });
      setGenQuestion(result);
      setIsCorrect(null);
      setSelected(null);
      setAiAnalysis(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Falla de Motor IA", description: "No se pudo generar el desafío." });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isUserLoading || isDbLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="font-black uppercase tracking-widest text-[10px]">Accediendo al Banco de Datos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px]">
              <Timer className="w-4 h-4" /> Entrenador Sabio
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[9px] font-black uppercase">
                {currentQ.componentId}
              </Badge>
              <Badge variant="outline" className="bg-accent/5 text-accent border-accent/20 text-[9px] font-black uppercase">
                {currentQ.competencyId}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerateAi} disabled={isGenerating} className="game-button border-primary/20 text-primary">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Desafío IA
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 game-card border-primary/20 shadow-2xl bg-card">
            <div className="bg-primary/5 p-10 border-b-2 border-primary/10">
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight italic leading-snug">
                {currentQ.text || currentQ.title}
              </h2>
            </div>
            <CardContent className="p-10 space-y-4">
              {currentQ.options.map((opt: string, i: number) => (
                <button
                  key={i}
                  disabled={isCorrect !== null}
                  onClick={() => setSelected(i)}
                  className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selected === i ? 'border-primary bg-primary/5 shadow-inner scale-[1.02]' : 'border-muted hover:border-primary/40 hover:bg-muted/50'}
                    ${isCorrect && i === (currentQ.correctAnswerIndex ?? currentQ.correctIndex) ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selected === i ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1 text-lg italic">{opt}</span>
                  {isCorrect && i === (currentQ.correctAnswerIndex ?? currentQ.correctIndex) && <CheckCircle2 className="text-secondary w-6 h-6" />}
                  {isCorrect === false && selected === i && <AlertCircle className="text-destructive w-6 h-6" />}
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {isCorrect === null ? (
              <div className="p-10 rounded-3xl bg-card border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-center gap-6 h-full min-h-[400px]">
                <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
                <div className="space-y-2">
                  <p className="text-primary font-black uppercase tracking-widest text-[10px]">Analizando Respuesta...</p>
                  <p className="text-xs text-muted-foreground italic max-w-xs">Elige una opción para ver la validación del sistema.</p>
                </div>
                <Button className="game-button bg-primary w-full h-14 text-white shadow-lg glow-primary" disabled={selected === null} onClick={handleCheck}>
                  Confirmar Selección
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40 glow-secondary' : 'border-destructive/40 shadow-xl'}`}>
                  <CardContent className="p-0">
                    <div className={`p-6 flex items-center gap-4 ${isCorrect ? 'bg-secondary/10' : 'bg-destructive/10'}`}>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                        {isCorrect ? <ShieldCheck className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight">{isCorrect ? '¡Excelente!' : 'Analiza tu Error'}</h3>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic">Maestro IA listo para explicar</p>
                      </div>
                    </div>

                    {!aiAnalysis ? (
                      <div className="p-6 space-y-4">
                        <Button className="w-full game-button bg-primary text-white h-12 glow-primary" onClick={handleAiAnalysis} disabled={isExplaining}>
                          {isExplaining ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analizando...</> : "Generar Explicación Master IA"}
                        </Button>
                        <Button variant="ghost" className="w-full font-black uppercase text-[10px] tracking-widest" onClick={handleNext}>Omitir y Siguiente</Button>
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/20">
                        <Tabs defaultValue="solucion" className="w-full">
                          <TabsList className="grid w-full grid-cols-3 bg-background border border-primary/10 h-10">
                            <TabsTrigger value="planteamiento" className="text-[9px] font-black uppercase">Fase 1</TabsTrigger>
                            <TabsTrigger value="solucion" className="text-[9px] font-black uppercase">Fase 2</TabsTrigger>
                            <TabsTrigger value="errores" className="text-[9px] font-black uppercase">Fase 3</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="planteamiento" className="mt-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-background p-5 rounded-xl border border-primary/30 glow-primary">
                               <Badge className="bg-primary/20 text-primary border-none text-[8px] font-black uppercase mb-3">
                                 {aiAnalysis.slide1.metadata.origin}
                               </Badge>
                               <p className="text-xs text-muted-foreground italic leading-relaxed">
                                 {aiAnalysis.slide1.contextSummary}
                               </p>
                             </div>
                          </TabsContent>

                          <TabsContent value="solucion" className="mt-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-secondary/5 p-5 rounded-xl border border-secondary/30 glow-secondary">
                               <h4 className="text-[10px] font-black uppercase text-secondary mb-4 flex items-center gap-2">
                                 <GraduationCap className="w-4 h-4" /> Solución Paso a Paso
                               </h4>
                               <div className="space-y-4">
                                 {aiAnalysis.slide2.stepByStep.map((step, i) => (
                                   <div key={i} className="flex gap-3 text-xs">
                                     <span className="text-secondary font-black">{i + 1}.</span>
                                     <p className="text-muted-foreground">{step}</p>
                                   </div>
                                 ))}
                               </div>
                             </div>
                          </TabsContent>

                          <TabsContent value="errores" className="mt-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-destructive/5 p-5 rounded-xl border border-destructive/30">
                               <h4 className="text-[10px] font-black uppercase text-destructive mb-4">Análisis de Errores</h4>
                               <div className="space-y-3">
                                 {aiAnalysis.slide3.distractors.map((dist, i) => (
                                   <div key={i} className="p-3 bg-background rounded-lg border border-muted-foreground/10">
                                     <p className="text-[9px] font-black text-foreground uppercase mb-1">{dist.option}: {dist.errorType}</p>
                                     <p className="text-[9px] text-muted-foreground italic leading-tight">{dist.explanation}</p>
                                   </div>
                                 ))}
                               </div>
                             </div>
                          </TabsContent>
                        </Tabs>
                        <Button className="w-full game-button bg-primary text-white h-12 mt-4 shadow-lg" onClick={handleNext}>
                          Siguiente Misión <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
