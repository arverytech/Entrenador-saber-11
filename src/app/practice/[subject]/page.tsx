"use client";

import { useState, useMemo, useEffect } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Timer, Zap, AlertCircle, CheckCircle2, Shield, BrainCircuit, ArrowRight, Loader2, Wand2, Info, GraduationCap, XCircle, RefreshCcw } from 'lucide-react';
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
      id: "math_fall_01",
      title: "En una secuencia aritmética, el primer término es 5 y la diferencia común es 3. ¿Cuál es el valor del término número 12?",
      options: ["A) 35", "B) 38", "C) 41", "D) 44"],
      correctIndex: 1,
      component: "Numérico - Variacional",
      competency: "Formulación y Ejecución",
      level: "Medio",
      explanation: "Fórmula: a_n = a_1 + (n-1)d. Entonces: 5 + (11)*3 = 5 + 33 = 38."
    }
  ]
};

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const { user, firestore, isUserLoading } = useUser();
  const { toast } = useToast();
  
  const currentSubject = params.subject.toLowerCase();
  
  // Consulta de preguntas reales desde Firestore
  const questionsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'questions'), where('subjectId', '==', currentSubject), limit(10));
  }, [firestore, currentSubject]);

  const { data: dbQuestions, isLoading: isDbLoading } = useCollection(questionsQuery);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<DynamicAnswerExplanationOutput | null>(null);
  const [generatedQuestion, setGeneratedQuestion] = useState<GenerateQuestionOutput | null>(null);

  // Mezclar preguntas de DB y Fallback
  const activeQuestions = useMemo(() => {
    if (dbQuestions && dbQuestions.length > 0) return dbQuestions;
    return FALLBACK_QUESTIONS[currentSubject] || FALLBACK_QUESTIONS['matematicas'];
  }, [dbQuestions, currentSubject]);

  const currentQuestion = useMemo(() => {
    if (generatedQuestion) return generatedQuestion;
    return activeQuestions[currentQuestionIndex % activeQuestions.length];
  }, [activeQuestions, currentQuestionIndex, generatedQuestion]);

  const handleCheck = async () => {
    if (selectedOption === null) return;
    
    const correctIdx = currentQuestion.correctIndex !== undefined ? currentQuestion.correctIndex : currentQuestion.correctAnswerIndex;
    const correct = selectedOption === correctIdx;
    setIsCorrect(correct);

    if (correct) {
      toast({ title: "¡Excelente!", description: "+50 XP ganados para tu cuenta real." });
      if (user && firestore) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { currentPoints: increment(50), updatedAt: serverTimestamp() });
      }
    }

    if (user && firestore) {
      const attemptsRef = collection(firestore, 'users', user.uid, 'quizAttempts');
      addDoc(attemptsRef, {
        questionId: currentQuestion.id,
        subject: currentSubject,
        isCorrect: correct,
        selectedAnswer: selectedOption,
        timestamp: serverTimestamp(),
        component: currentQuestion.component || currentQuestion.metadata?.component,
        competency: currentQuestion.competency || currentQuestion.metadata?.competency,
        level: currentQuestion.level || currentQuestion.metadata?.level
      });
    }
  };

  const handleAiAnalysis = async () => {
    if (selectedOption === null) return;
    setIsExplaining(true);
    setAiAnalysis(null);
    try {
      const result = await generateExplanation({
        question: currentQuestion.title || currentQuestion.text,
        userAnswer: currentQuestion.options[selectedOption],
        correctAnswer: currentQuestion.options[currentQuestion.correctIndex !== undefined ? currentQuestion.correctIndex : currentQuestion.correctAnswerIndex],
        options: currentQuestion.options,
        subject: currentSubject,
        component: currentQuestion.component || currentQuestion.metadata?.component || "General",
        competency: currentQuestion.competency || currentQuestion.metadata?.competency || "Razonamiento",
      });
      setAiAnalysis(result);
    } catch (e: any) {
      console.error("AI Error:", e);
      toast({ 
        variant: "destructive", 
        title: "Tutor IA Fuera de Línea", 
        description: "Asegúrate de configurar la GOOGLE_GENAI_API_KEY en Vercel." 
      });
    } finally {
      setIsExplaining(false);
    }
  };

  const handleNext = () => {
    setIsCorrect(null);
    setSelectedOption(null);
    setAiAnalysis(null);
    setGeneratedQuestion(null);
    setCurrentQuestionIndex(prev => prev + 1);
  };

  const handleGenerateAiQuestion = async () => {
    setIsGenerating(true);
    try {
      const result = await generateIcfesQuestion({
        subject: currentSubject,
        component: "Aleatorio",
        competency: "Razonamiento",
        level: "Medio"
      });
      setGeneratedQuestion(result);
      setIsCorrect(null);
      setSelectedOption(null);
      setAiAnalysis(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Error IA", description: "No se pudo generar una pregunta nueva." });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isUserLoading || isDbLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="font-black uppercase tracking-widest text-xs">Cargando Banco de Preguntas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4 relative overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 relative z-10">
            <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
              <Timer className="w-5 h-5" />
              Entrenamiento Sabio
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold text-[10px] uppercase">
                Comp: {currentQuestion.component || currentQuestion.metadata?.component}
              </Badge>
              <Badge variant="outline" className="bg-accent/5 border-accent/20 text-accent font-bold text-[10px] uppercase">
                Nivel: {currentQuestion.level || currentQuestion.metadata?.level}
              </Badge>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGenerateAiQuestion}
            disabled={isGenerating}
            className="game-button border-primary/20 text-primary hover:bg-primary/10"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Nuevo Desafío IA
          </Button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className={`lg:col-span-2 game-card border-primary/20 shadow-xl overflow-hidden bg-card ${isGenerating ? 'opacity-50' : ''}`}>
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-10 border-b-2 border-primary/10">
              <h2 className="text-2xl md:text-3xl font-bold leading-snug text-foreground">
                {currentQuestion.title || currentQuestion.text}
              </h2>
            </div>
            <CardContent className="p-10 space-y-4">
              {currentQuestion.options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  disabled={isCorrect !== null}
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selectedOption === idx ? 'border-primary bg-primary/5 shadow-md scale-[1.01]' : 'border-muted hover:border-primary/40 hover:bg-muted/30'}
                    ${isCorrect && idx === (currentQuestion.correctIndex !== undefined ? currentQuestion.correctIndex : currentQuestion.correctAnswerIndex) ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1 text-lg text-foreground">{opt}</span>
                  {isCorrect && idx === (currentQuestion.correctIndex !== undefined ? currentQuestion.correctIndex : currentQuestion.correctAnswerIndex) && <CheckCircle2 className="text-secondary shrink-0 ml-4 w-6 h-6" />}
                  {isCorrect === false && selectedOption === idx && <AlertCircle className="text-destructive shrink-0 ml-4 w-6 h-6" />}
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {isCorrect === null ? (
              <div className="p-10 rounded-3xl bg-card border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-center gap-6 h-full min-h-[400px]">
                <div className="bg-primary/10 p-4 rounded-full">
                  <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
                </div>
                <div className="space-y-2">
                  <p className="text-primary font-black uppercase tracking-widest text-xs">Análisis en Tiempo Real</p>
                  <p className="text-muted-foreground text-sm italic leading-relaxed">Selecciona una opción para validar tu conocimiento.</p>
                </div>
                <Button 
                  className="game-button bg-primary w-full h-14 text-lg text-white shadow-lg glow-primary" 
                  disabled={selectedOption === null}
                  onClick={handleCheck}
                >
                  Confirmar Selección
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40 glow-secondary' : 'border-destructive/40 shadow-lg'}`}>
                  <CardContent className="p-0">
                    <div className={`p-6 flex items-center gap-4 ${isCorrect ? 'bg-secondary/10' : 'bg-destructive/10'}`}>
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                        {isCorrect ? <CheckCircle2 className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase tracking-tight text-foreground">{isCorrect ? '¡Excelente!' : 'Analiza tu Error'}</h3>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">IA Maestro está listo.</p>
                      </div>
                    </div>

                    {!aiAnalysis ? (
                      <div className="p-6 space-y-4">
                        <Button 
                          className="w-full game-button bg-primary text-white h-12 glow-primary"
                          onClick={handleAiAnalysis}
                          disabled={isExplaining}
                        >
                          {isExplaining ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Consultando Tutor...</> : "Generar Explicación Master IA"}
                        </Button>
                        <Button variant="ghost" className="w-full h-12 uppercase font-black text-[10px] tracking-widest" onClick={handleNext}>
                          Omitir y Siguiente
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 bg-muted/20">
                        <Tabs defaultValue="solucion" className="w-full">
                          <TabsList className="grid w-full grid-cols-3 bg-background/50 border border-primary/10 h-10 p-1">
                            <TabsTrigger value="planteamiento" className="text-[9px] font-black uppercase">Fase 1</TabsTrigger>
                            <TabsTrigger value="solucion" className="text-[9px] font-black uppercase">Fase 2</TabsTrigger>
                            <TabsTrigger value="errores" className="text-[9px] font-black uppercase">Fase 3</TabsTrigger>
                          </TabsList>
                          
                          <TabsContent value="planteamiento" className="mt-4 space-y-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-background p-4 rounded-xl border border-primary/20">
                               <Badge className="bg-primary/20 text-primary border-none text-[8px] font-black uppercase mb-2">
                                 {aiAnalysis.slide1.metadata.origin}
                               </Badge>
                               <p className="text-xs text-muted-foreground leading-relaxed italic">
                                 {aiAnalysis.slide1.contextSummary}
                               </p>
                             </div>
                          </TabsContent>

                          <TabsContent value="solucion" className="mt-4 space-y-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-secondary/5 p-4 rounded-xl border border-secondary/20 glow-secondary">
                               <h4 className="text-[10px] font-black uppercase text-secondary mb-3 flex items-center gap-2">
                                 <GraduationCap className="w-4 h-4" /> Solución Paso a Paso
                               </h4>
                               <div className="space-y-3">
                                 {aiAnalysis.slide2.stepByStep.map((step, i) => (
                                   <div key={i} className="flex gap-3 text-xs">
                                     <span className="text-secondary font-black">{i + 1}.</span>
                                     <p className="text-muted-foreground">{step}</p>
                                   </div>
                                 ))}
                               </div>
                               <div className="mt-4 p-3 bg-white/50 rounded-lg border border-secondary/10">
                                 <p className="text-[10px] italic text-muted-foreground">"{aiAnalysis.slide2.pedagogicalConclusion}"</p>
                               </div>
                             </div>
                          </TabsContent>

                          <TabsContent value="errores" className="mt-4 space-y-4 animate-in zoom-in-95 duration-300">
                             <div className="bg-destructive/5 p-4 rounded-xl border border-destructive/20">
                               <h4 className="text-[10px] font-black uppercase text-destructive mb-4">Análisis de Errores</h4>
                               <div className="space-y-3">
                                 {aiAnalysis.slide3.distractors.map((dist, i) => (
                                   <div key={i} className="p-3 bg-background rounded-lg border border-muted-foreground/10">
                                     <div className="flex items-center gap-2 mb-1">
                                       <Badge variant="outline" className="h-4 px-1 text-[8px] border-destructive text-destructive">{dist.option}</Badge>
                                       <p className="text-[9px] font-black text-foreground uppercase">{dist.errorType}</p>
                                     </div>
                                     <p className="text-[9px] text-muted-foreground leading-tight italic">{dist.explanation}</p>
                                   </div>
                                 ))}
                               </div>
                             </div>
                          </TabsContent>
                        </Tabs>
                        
                        <Button className="w-full game-button bg-primary text-white h-12 mt-4 shadow-lg" onClick={handleNext}>
                          Siguiente Misión
                          <ArrowRight className="ml-2 w-4 h-4" />
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
