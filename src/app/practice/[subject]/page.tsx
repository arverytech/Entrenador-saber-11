"use client";

import { useState, useMemo } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Timer, AlertCircle, CheckCircle2, BrainCircuit, ArrowRight, Loader2, Wand2, GraduationCap, XCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useCollection, useMemoFirebase } from '@/firebase';
import { doc, increment, collection, addDoc, serverTimestamp, query, where, limit } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { generateExplanation, type DynamicAnswerExplanationOutput } from '@/ai/flows/dynamic-answer-explanations-flow';
import { generateIcfesQuestion, type GenerateQuestionOutput } from '@/ai/flows/generate-question-flow';

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
    return [];
  }, [dbQuestions]);

  const currentQ = useMemo(() => {
    if (genQuestion) return genQuestion;
    if (activeQuestions.length > 0) return activeQuestions[currentIdx % activeQuestions.length];
    return null;
  }, [activeQuestions, currentIdx, genQuestion]);

  const handleCheck = async () => {
    if (selected === null || !currentQ) return;
    const correctIdx = currentQ.correctAnswerIndex ?? currentQ.correctIndex;
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
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar la explicación." });
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
        component: "General",
        competency: "Resolución de problemas",
        level: "Medio"
      });
      setGenQuestion(result);
      setIsCorrect(null);
      setSelected(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Falla en el motor IA." });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isUserLoading || isDbLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="font-black uppercase tracking-widest text-[10px]">Cargando Banco de Datos...</p>
      </div>
    );
  }

  if (!currentQ && !isGenerating) {
    return (
       <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6 text-center">
         <GraduationCap className="w-16 h-16 text-muted-foreground" />
         <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase">No hay preguntas disponibles</h2>
            <p className="text-muted-foreground italic">El administrador aún no ha cargado preguntas oficiales o la IA está ocupada.</p>
         </div>
         <Button onClick={handleGenerateAi} className="game-button bg-primary text-white h-12">
           <Wand2 className="w-4 h-4 mr-2" /> Generar Desafío IA
         </Button>
       </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <Timer className="w-4 h-4 text-primary" />
            <Badge variant="outline" className="text-[10px] uppercase font-black">{currentQ?.componentId || "General"}</Badge>
            <Badge variant="outline" className="text-[10px] uppercase font-black">{currentQ?.competencyId || "Razonamiento"}</Badge>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerateAi} disabled={isGenerating} className="game-button text-primary">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Desafío IA
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 game-card border-primary/20 bg-card">
            <div className="p-10 border-b-2 border-primary/5">
              <h2 className="text-2xl font-black uppercase italic leading-snug">
                {currentQ?.text || currentQ?.title}
              </h2>
            </div>
            <CardContent className="p-10 space-y-4">
              {currentQ?.options.map((opt: string, i: number) => (
                <button
                  key={i}
                  disabled={isCorrect !== null}
                  onClick={() => setSelected(i)}
                  className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between
                    ${selected === i ? 'border-primary bg-primary/5' : 'border-muted hover:bg-muted/50'}
                    ${isCorrect && i === (currentQ.correctAnswerIndex ?? currentQ.correctIndex) ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selected === i ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="italic">{opt}</span>
                  {isCorrect && i === (currentQ.correctAnswerIndex ?? currentQ.correctIndex) && <CheckCircle2 className="text-secondary w-6 h-6" />}
                  {isCorrect === false && selected === i && <AlertCircle className="text-destructive w-6 h-6" />}
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {isCorrect === null ? (
              <div className="p-10 rounded-3xl bg-card border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-center gap-6 min-h-[400px]">
                <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
                <Button className="game-button bg-primary w-full h-14 text-white shadow-lg" disabled={selected === null} onClick={handleCheck}>
                  Confirmar Selección
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40' : 'border-destructive/40'}`}>
                  <div className={`p-6 flex items-center gap-4 ${isCorrect ? 'bg-secondary/10' : 'bg-destructive/10'}`}>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                      {isCorrect ? <ShieldCheck className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">{isCorrect ? '¡Bien hecho!' : 'Analiza el error'}</h3>
                  </div>

                  {!aiAnalysis ? (
                    <div className="p-6 space-y-4">
                      <Button className="w-full game-button bg-primary text-white h-12" onClick={handleAiAnalysis} disabled={isExplaining}>
                        {isExplaining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Generar Análisis Maestro IA"}
                      </Button>
                      <Button variant="ghost" className="w-full font-black uppercase text-[10px]" onClick={handleNext}>Siguiente</Button>
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/20">
                      <Tabs defaultValue="solucion" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 bg-background border h-10">
                          <TabsTrigger value="planteamiento" className="text-[9px] font-black uppercase">Fase 1</TabsTrigger>
                          <TabsTrigger value="solucion" className="text-[9px] font-black uppercase">Fase 2</TabsTrigger>
                          <TabsTrigger value="errores" className="text-[9px] font-black uppercase">Fase 3</TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="planteamiento" className="mt-4">
                             <div className="bg-background p-5 rounded-xl border-l-4 border-primary">
                               <Badge className="bg-primary/10 text-primary mb-3 text-[8px]">{aiAnalysis.slide1.metadata.origin}</Badge>
                               <p className="text-xs italic leading-relaxed">{aiAnalysis.slide1.contextSummary}</p>
                             </div>
                        </TabsContent>

                        <TabsContent value="solucion" className="mt-4">
                             <div className="bg-secondary/5 p-5 rounded-xl border-l-4 border-secondary">
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

                        <TabsContent value="errores" className="mt-4">
                             <div className="bg-destructive/5 p-5 rounded-xl border-l-4 border-destructive">
                               <h4 className="text-[10px] font-black uppercase text-destructive mb-4">Análisis de Errores</h4>
                               <div className="space-y-3">
                                 {aiAnalysis.slide3.distractors.map((dist, i) => (
                                   <div key={i} className="p-3 bg-background rounded-lg border">
                                     <p className="text-[9px] font-black uppercase mb-1">{dist.option}: {dist.errorType}</p>
                                     <p className="text-[9px] text-muted-foreground italic">{dist.explanation}</p>
                                   </div>
                                 ))}
                               </div>
                             </div>
                        </TabsContent>
                      </Tabs>
                      <Button className="w-full game-button bg-primary text-white h-12 mt-4" onClick={handleNext}>
                        Continuar Entrenamiento <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
