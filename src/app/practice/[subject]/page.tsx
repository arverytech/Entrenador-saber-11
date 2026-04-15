
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
      id: "math_2025_01",
      title: "En una secuencia aritmética, el primer término es 5 y la diferencia común es 3. ¿Cuál es el valor del término número 12?",
      options: ["A) 35", "B) 38", "C) 41", "D) 44"],
      correctIndex: 1,
      component: "Numérico - Variacional",
      competency: "Formulación y Ejecución",
      level: "Medio",
      explanation: "Fórmula: a_n = a_1 + (n-1)d. Entonces: 5 + (12-1)*3 = 5 + 33 = 38."
    },
    {
      id: "math_2024_02",
      title: "¿Cuál es el área de un círculo cuyo diámetro es 10 cm? (Use π ≈ 3.14)",
      options: ["A) 31.4 cm²", "B) 78.5 cm²", "C) 157 cm²", "D) 314 cm²"],
      correctIndex: 1,
      component: "Geométrico - Métrico",
      competency: "Interpretación y Representación",
      level: "Básico",
      explanation: "Radio = 5. Área = π * r² = 3.14 * 25 = 78.5."
    }
  ],
  lectura: [
    {
      id: "lc_2024_01",
      title: "Si un autor utiliza la palabra 'paradójicamente' para introducir una idea, su intención es:",
      options: ["A) Confirmar una obviedad", "B) Señalar una contradicción", "C) Describir un paisaje", "D) Citar a un experto"],
      correctIndex: 1,
      component: "Pragmático",
      competency: "Reflexión sobre el contenido",
      level: "Medio",
      explanation: "La paradoja implica una contradicción aparente que encierra una verdad."
    }
  ],
  socioemocional: [
    {
      id: "se_2024_01",
      title: "Un compañero de clase está siendo excluido de un grupo de estudio. Tú notas que esto le afecta. La acción más empática sería:",
      options: ["A) Ignorar la situación para no tener problemas.", "B) Unirte a la exclusión para encajar en el grupo.", "C) Hablar con el grupo e invitar al compañero a integrarse.", "D) Reírte de la situación en secreto."],
      correctIndex: 2,
      component: "Empatía",
      competency: "Toma de Perspectiva",
      level: "Ciudadano",
      explanation: "La empatía requiere reconocer el sentimiento ajeno y actuar para mejorar la situación social."
    }
  ],
  naturales: [
    {
      id: "cn_2024_05",
      title: "En un ecosistema, ¿cuál es el papel principal de los organismos descomponedores?",
      options: ["A) Producir oxígeno", "B) Reciclar materia orgánica", "C) Consumir herbívoros", "D) Captar energía solar"],
      correctIndex: 1,
      component: "Biológico",
      competency: "Uso comprensivo del conocimiento",
      level: "Básico",
      explanation: "Los descomponedores transforman la materia orgánica muerta en inorgánica para que las plantas la usen."
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
      toast({ title: "¡Excelente!", description: "+50 XP ganados para tu cuenta real." });
      if (user && firestore) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { 
          currentPoints: increment(50),
          updatedAt: serverTimestamp()
        });
      }
    } else {
      toast({ title: "Intenta de nuevo", description: "Revisa la justificación técnica abajo.", variant: "destructive" });
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
        context: `Asignatura: ${currentSubject}, Componente: ${currentQuestion.component}`
      });
      setAiExplanation(result.explanation);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "IA Ocupada", description: "No pudimos conectar con el tutor en este momento." });
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
        component: currentQuestion.component || "General",
        competency: currentQuestion.competency || "General",
        level: "Medio"
      });
      setGeneratedQuestion(question);
      toast({ title: "¡Nuevo Ítem Generado!", description: "La IA ha creado un desafío basado en el DCE." });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar el ítem." });
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
            <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-sm">
              <Timer className="w-5 h-5" />
              Saber 11 Real-Time
            </div>
            <div className="hidden md:block h-6 w-[2px] bg-muted" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold text-[10px] uppercase">
                {currentQuestion.metadata?.component || currentQuestion.component}
              </Badge>
              <Badge variant="outline" className="bg-secondary/5 border-secondary/20 text-secondary font-bold text-[10px] uppercase">
                {currentQuestion.metadata?.level || currentQuestion.level}
              </Badge>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleGenerateAiQuestion} 
            disabled={isGenerating}
            className="game-button border-accent/50 text-accent hover:bg-accent/10"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Desafío IA Personalizado
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
                  disabled={isCorrect !== null || isGenerating}
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full p-6 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selectedOption === idx ? 'border-primary bg-primary/5 shadow-md scale-[1.01]' : 'border-muted hover:border-primary/40 hover:bg-muted/30'}
                    ${isCorrect && idx === (currentQuestion.correctIndex ?? currentQuestion.correctAnswerIndex) ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1 text-lg text-foreground">{opt}</span>
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
                <div className="space-y-2">
                  <p className="text-primary font-black uppercase tracking-widest text-xs">Modo Entrenamiento</p>
                  <p className="text-muted-foreground text-sm italic leading-relaxed">
                    Analiza bien la pregunta antes de confirmar. Tu progreso se guardará en tu perfil real.
                  </p>
                </div>
                <Button 
                  className="game-button bg-primary w-full h-14 text-lg text-white shadow-lg glow-primary" 
                  disabled={selectedOption === null || isGenerating}
                  onClick={handleCheck}
                >
                  Confirmar Respuesta
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
                        <h3 className="text-2xl font-black uppercase tracking-tight text-foreground">{isCorrect ? '¡CORRECTO!' : 'INCENDIO'}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP GANADOS' : 'ANÁLISIS DE ERROR'}</p>
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
                            <Sparkles className="w-3 h-3 text-accent" /> Explicación IA Personalizada:
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
                          {isExplaining ? "Pensando..." : "Solicitar Tutoría IA"}
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
