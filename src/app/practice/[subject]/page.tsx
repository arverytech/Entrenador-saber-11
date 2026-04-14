
"use client";

import { useState, useMemo } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Timer, Zap, AlertCircle, CheckCircle2, Shield, BrainCircuit, ArrowRight, Loader2, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/firebase';
import { doc, increment, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';
import { generateIcfesQuestion, type GenerateQuestionOutput } from '@/ai/flows/generate-question-flow';

const SUBJECT_DATA: Record<string, any[]> = {
  matematicas: [
    {
      id: "math_2024_01",
      title: "Un tanque cilíndrico tiene un radio de 2m y una altura de 5m. Si se llena hasta el 80% de su capacidad, ¿qué volumen de agua contiene? (Use π ≈ 3.14)",
      options: ["A) 62.8 m³", "B) 50.24 m³", "C) 12.56 m³", "D) 25.12 m³"],
      correctIndex: 1,
      component: "Geométrico - Métrico",
      competency: "Formulación y Ejecución",
      level: "III (Avanzado)",
      explanation: "Volumen = π * r² * h = 3.14 * 4 * 5 = 62.8. El 80% de 62.8 es 50.24 m³."
    },
    {
      id: "math_2023_02",
      title: "En una bolsa hay 3 bolas rojas, 2 azules y 5 verdes. Si se extrae una bola al azar, ¿cuál es la probabilidad de que NO sea verde?",
      options: ["A) 1/2", "B) 3/10", "C) 1/5", "D) 2/3"],
      correctIndex: 0,
      component: "Aleatorio (Estadística)",
      competency: "Interpretación y Representación",
      level: "II (Medio)",
      explanation: "Total 10 bolas. No verdes = 5 (3 rojas + 2 azules). P = 5/10 = 1/2."
    }
  ],
  lectura: [
    {
      id: "lc_2024_01",
      title: "Si un autor utiliza ironía para criticar una política pública en una columna de opinión, ¿cuál es su intención comunicativa principal?",
      options: ["A) Informar datos objetivos.", "B) Ridiculizar una postura.", "C) Describir un proceso legal.", "D) Elogiar a los gobernantes."],
      correctIndex: 1,
      component: "Reflexivo - Pragmático",
      competency: "Reflexión sobre el contenido y la forma",
      level: "III (Avanzado)",
      explanation: "La ironía busca dar a entender lo contrario de lo que se dice con fines críticos."
    }
  ],
  naturales: [
    {
      id: "cn_2024_01",
      title: "En un ecosistema, ¿qué sucede con la energía disponible a medida que se avanza en los niveles tróficos?",
      options: ["A) Aumenta exponencialmente.", "B) Se mantiene constante.", "C) Disminuye progresivamente.", "D) Se duplica en cada nivel."],
      correctIndex: 2,
      component: "Biológico (Ecosistemas)",
      competency: "Uso comprensivo del conocimiento científico",
      level: "II (Medio)",
      explanation: "Solo el 10% de la energía pasa al siguiente nivel; el resto se pierde como calor."
    }
  ],
  sociales: [
    {
      id: "soc_2024_01",
      title: "¿Qué rama del poder público en Colombia es la encargada de dictar las leyes y reformar la Constitución?",
      options: ["A) Ejecutiva", "B) Judicial", "C) Legislativa", "D) Ciudadana"],
      correctIndex: 2,
      component: "Pensamiento Social (Estado)",
      competency: "Pensamiento Social",
      level: "I (Básico)",
      explanation: "El Congreso de la República ejerce la función legislativa."
    }
  ],
  ingles: [
    {
      id: "eng_2024_01",
      title: "Choose the correct sentence: 'If I __________ more money, I would buy a new car.'",
      options: ["A) have", "B) had", "C) will have", "D) am having"],
      correctIndex: 1,
      component: "Uso Funcional (Grammar)",
      competency: "Lingüística (Second Conditional)",
      level: "B1 (Intermedio)",
      explanation: "Second Conditional uses 'if + past simple' for hypothetical situations."
    }
  ],
  socioemocional: [
    {
      id: "se_2024_01",
      title: "Un compañero de clase cometió un error y todos se ríen. Tú notas que él está muy avergonzado. ¿Qué acción demuestra regulación emocional y empatía?",
      options: ["A) Reírte también para encajar.", "B) Salir del salón sin decir nada.", "C) Esperar a que se calme y ofrecerle apoyo.", "D) Gritarles a todos que se callen."],
      correctIndex: 2,
      component: "Empatía y Convivencia",
      competency: "Manejo de Emociones",
      level: "I (Ciudadano)",
      explanation: "La empatía requiere reconocer el sentimiento del otro y actuar con respeto."
    }
  ]
};

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [generatedQuestion, setGeneratedQuestion] = useState<GenerateQuestionOutput | null>(null);
  
  const { user, firestore } = useUser();
  const { toast } = useToast();

  const currentSubject = params.subject.toLowerCase();
  const staticQuestions = useMemo(() => SUBJECT_DATA[currentSubject] || SUBJECT_DATA['matematicas'], [currentSubject]);
  
  const currentQuestion = useMemo(() => {
    if (generatedQuestion) return generatedQuestion;
    return staticQuestions[currentQuestionIndex % staticQuestions.length];
  }, [staticQuestions, currentQuestionIndex, generatedQuestion]);

  const handleCheck = async () => {
    if (selectedOption === null) return;
    
    const correct = selectedOption === (currentQuestion.correctIndex ?? currentQuestion.correctAnswerIndex);
    setIsCorrect(correct);

    if (correct) {
      toast({ title: "¡Misión Cumplida!", description: "+50 XP ganados para tu avatar." });
      if (user && firestore) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { 
          currentPoints: increment(50),
          updatedAt: serverTimestamp()
        });
      }
    } else {
      toast({ title: "Sigue Entrenando", description: "Analiza la explicación técnica.", variant: "destructive" });
    }

    if (user && firestore) {
      const attemptsRef = collection(firestore, 'users', user.uid, 'quizAttempts');
      addDoc(attemptsRef, {
        questionId: currentQuestion.id,
        subject: currentSubject,
        isCorrect: correct,
        selectedAnswer: selectedOption,
        timestamp: serverTimestamp(),
        component: currentQuestion.metadata?.component || currentQuestion.component,
        competency: currentQuestion.metadata?.competency || currentQuestion.competency,
        level: currentQuestion.metadata?.level || currentQuestion.level
      });
    }
  };

  const handleAiExplanation = async () => {
    if (selectedOption === null) return;
    setIsExplaining(true);
    try {
      const result = await generateExplanation({
        question: currentQuestion.title || currentQuestion.text,
        userAnswer: currentQuestion.options[selectedOption],
        correctAnswer: currentQuestion.options[currentQuestion.correctIndex ?? currentQuestion.correctAnswerIndex],
        context: `Materia: ${currentSubject}, Componente: ${currentQuestion.component}, Competencia: ${currentQuestion.competency}`
      });
      setAiExplanation(result.explanation);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error IA", description: "No pudimos conectar con el tutor IA." });
    } finally {
      setIsExplaining(false);
    }
  };

  const handleGenerateAiQuestion = async () => {
    setIsGenerating(true);
    setGeneratedQuestion(null);
    setIsCorrect(null);
    setSelectedOption(null);
    setAiExplanation("");

    try {
      const question = await generateIcfesQuestion({
        subject: currentSubject,
        component: currentQuestion.component,
        competency: currentQuestion.competency,
        level: "II"
      });
      setGeneratedQuestion(question);
      toast({ title: "¡Desafío Generado!", description: "La IA ha construido un ítem nuevo para ti." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error de Generación", description: "La IA no pudo construir el ítem en este momento." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNext = () => {
    setIsCorrect(null);
    setSelectedOption(null);
    setAiExplanation("");
    setGeneratedQuestion(null);
    setCurrentQuestionIndex(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-primary">
              <Timer className="w-5 h-5" />
              <span className="font-bold tabular-nums text-lg">Entrenamiento Activo</span>
            </div>
            <div className="hidden md:block h-6 w-[2px] bg-muted" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold text-[10px] uppercase">
                {currentQuestion.metadata?.component || currentQuestion.component}
              </Badge>
              <Badge variant="outline" className="bg-secondary/5 border-secondary/20 text-secondary font-bold text-[10px] uppercase">
                {currentQuestion.metadata?.competency || currentQuestion.competency}
              </Badge>
              <Badge variant="outline" className="bg-accent/5 border-accent/20 text-accent font-bold text-[10px] uppercase">
                {currentQuestion.metadata?.level || currentQuestion.level}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGenerateAiQuestion} 
              disabled={isGenerating}
              className="game-button border-accent/50 text-accent hover:bg-accent/10"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
              {isGenerating ? "Creando ítem..." : "Desafío IA"}
            </Button>
            <span className="text-[10px] font-black uppercase text-muted-foreground ml-4">Pregunta {currentQuestionIndex + 1}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className={`lg:col-span-2 game-card border-primary/20 shadow-xl overflow-hidden bg-card ${isGenerating ? 'opacity-50 animate-pulse' : ''}`}>
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-10 border-b-2 border-primary/10">
              <h2 className="text-2xl md:text-3xl font-bold leading-snug text-foreground">
                {currentQuestion.title || currentQuestion.text}
              </h2>
            </div>
            <CardContent className="p-10 space-y-4">
              {currentQuestion.options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  disabled={isCorrect !== null || isGenerating}
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selectedOption === idx ? 'border-primary bg-primary/5 shadow-md scale-[1.01]' : 'border-muted hover:border-primary/40 hover:bg-muted/30'}
                    ${isCorrect && idx === (currentQuestion.correctIndex ?? currentQuestion.correctAnswerIndex) ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1 text-lg">{opt}</span>
                  {isCorrect && idx === (currentQuestion.correctIndex ?? currentQuestion.correctAnswerIndex) && <CheckCircle2 className="text-secondary shrink-0 ml-4 w-6 h-6" />}
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
                <div>
                  <p className="text-primary font-black uppercase tracking-widest text-xs mb-2">Manual del Aspirante</p>
                  <p className="text-muted-foreground text-sm italic leading-relaxed">
                    Identifica el **Componente** de la pregunta para aplicar la fórmula o estrategia correcta.
                  </p>
                </div>
                <Button 
                  className="game-button bg-primary w-full h-14 text-lg text-white shadow-lg glow-primary" 
                  disabled={selectedOption === null || isGenerating}
                  onClick={handleCheck}
                >
                  Confirmar Selección
                </Button>
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-8 duration-500">
                <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40 glow-secondary' : 'border-destructive/40 shadow-destructive/10'}`}>
                  <CardContent className="p-8 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                        {isCorrect ? <CheckCircle2 className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tight">{isCorrect ? '¡CORRECTO!' : 'INCORRECTO'}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP PARA TU AVATAR' : 'REVISA TU ESTRATEGIA'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-5 bg-muted/40 rounded-2xl border border-primary/10">
                        <p className="font-black text-primary uppercase text-[10px] tracking-widest mb-3 flex items-center gap-2">
                          <Shield className="w-3 h-3" /> Justificación Técnica:
                        </p>
                        <p className="text-sm text-muted-foreground leading-relaxed italic">
                          {currentQuestion.explanation}
                        </p>
                      </div>

                      {aiExplanation ? (
                        <div className="p-5 bg-primary/5 rounded-2xl border border-primary/20 animate-in fade-in zoom-in-95">
                          <p className="font-black text-primary uppercase text-[10px] tracking-widest mb-3 flex items-center gap-2">
                            <Sparkles className="w-3 h-3 text-accent" /> Tutor IA Personalizado:
                          </p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {aiExplanation}
                          </p>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          className="w-full game-button border-primary/30 text-primary h-12"
                          onClick={handleAiExplanation}
                          disabled={isExplaining}
                        >
                          {isExplaining ? "Analizando..." : "Solicitar Análisis IA"}
                          <BrainCircuit className="ml-2 w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <Button className="w-full game-button bg-primary text-white h-14 shadow-lg text-lg" onClick={handleNext}>
                      Siguiente Desafío
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
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
