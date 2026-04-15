
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
      level: "Avanzado",
      explanation: "El volumen total es π * r² * h = 3.14 * 4 * 5 = 62.8. El 80% de ese total es 50.24 m³."
    },
    {
      id: "math_2023_02",
      title: "Una empresa reporta que el 30% de sus empleados son bilingües. Si en la empresa hay 150 empleados, ¿cuántos NO son bilingües?",
      options: ["A) 45", "B) 105", "C) 30", "D) 120"],
      correctIndex: 1,
      component: "Numérico - Variacional",
      competency: "Interpretación y Representación",
      level: "Básico",
      explanation: "El 30% de 150 es 45. Por lo tanto, los que no son bilingües son 150 - 45 = 105."
    },
    {
      id: "math_2022_05",
      title: "¿Cuál es la probabilidad de obtener un número par al lanzar un dado de 6 caras?",
      options: ["A) 1/6", "B) 1/3", "C) 1/2", "D) 2/3"],
      correctIndex: 2,
      component: "Aleatorio",
      competency: "Argumentación",
      level: "Básico",
      explanation: "Los números pares son {2, 4, 6}, es decir, 3 de 6 caras. 3/6 = 1/2."
    }
  ],
  lectura: [
    {
      id: "lc_2024_01",
      title: "En un texto argumentativo, cuando el autor cita a una autoridad científica para respaldar su tesis, ¿qué tipo de recurso está utilizando?",
      options: ["A) Analogía", "B) Argumento de autoridad", "C) Generalización", "D) Ejemplificación"],
      correctIndex: 1,
      component: "Pragmático",
      competency: "Reflexión sobre el contenido",
      level: "Medio",
      explanation: "Citar a expertos o instituciones reconocidas es un argumento de autoridad."
    },
    {
      id: "lc_2023_04",
      title: "Si un autor utiliza ironía para criticar una política pública, ¿cuál es su intención principal?",
      options: ["A) Informar datos objetivos", "B) Persuadir mediante la burla", "C) Describir un proceso", "D) Elogiar al gobierno"],
      correctIndex: 1,
      component: "Semántico",
      competency: "Comprender cómo se articulan las partes de un texto",
      level: "Avanzado",
      explanation: "La ironía en textos de opinión busca cuestionar posturas mediante el sarcasmo."
    }
  ],
  naturales: [
    {
      id: "cn_2024_01",
      title: "¿Qué organelo celular es el encargado de la producción de energía mediante la respiración celular?",
      options: ["A) Ribosoma", "B) Mitocondria", "C) Núcleo", "D) Cloroplasto"],
      correctIndex: 1,
      component: "Biológico",
      competency: "Uso comprensivo del conocimiento científico",
      level: "Básico",
      explanation: "La mitocondria es la central energética de la célula donde ocurre el ciclo de Krebs."
    },
    {
      id: "cn_2023_09",
      title: "En un circuito en serie de tres bombillos, si uno se quema, ¿qué sucede con los otros?",
      options: ["A) Brillan más fuerte", "B) Se apagan", "C) Siguen igual", "D) Brillan menos"],
      correctIndex: 1,
      component: "Físico",
      competency: "Explicación de fenómenos",
      level: "Medio",
      explanation: "En serie, la corriente tiene un solo camino; si se abre, el circuito deja de funcionar."
    }
  ],
  sociales: [
    {
      id: "soc_2024_01",
      title: "¿Cuál de los siguientes mecanismos de participación permite a los ciudadanos decidir sobre la destitución de un alcalde?",
      options: ["A) Plebiscito", "B) Referendo", "C) Revocatoria del mandato", "D) Cabildo abierto"],
      correctIndex: 2,
      component: "Estado y Constitución",
      competency: "Pensamiento Social",
      level: "Medio",
      explanation: "La revocatoria es el derecho político para terminar el mandato de un gobernante local."
    }
  ],
  ingles: [
    {
      id: "eng_2024_01",
      title: "Complete: 'If I _______ more time, I would learn how to play the piano.'",
      options: ["A) have", "B) had", "C) will have", "D) am having"],
      correctIndex: 1,
      component: "Gramática",
      competency: "Uso funcional del lenguaje",
      level: "B1",
      explanation: "El segundo condicional usa 'if + past simple' para situaciones hipotéticas."
    }
  ],
  socioemocional: [
    {
      id: "se_2024_01",
      title: "Un compañero de equipo no está cumpliendo con su parte del trabajo. Tú te sientes molesto. ¿Cuál es la respuesta más asertiva?",
      options: ["A) Ignorarlo y hacer todo el trabajo solo.", "B) Hablar con él en privado sobre cómo afecta esto al equipo.", "C) Gritarle frente al grupo para que reaccione.", "D) Quejarte con el profesor sin hablar con él."],
      correctIndex: 1,
      component: "Comunicación Asertiva",
      competency: "Manejo de Conflictos",
      level: "Ciudadano",
      explanation: "La asertividad implica expresar sentimientos sin agredir al otro, buscando soluciones."
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
        component: currentQuestion.component || "General",
        competency: currentQuestion.competency || "General",
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
              <span className="font-bold tabular-nums text-lg">Entrenamiento Real</span>
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
            <span className="text-[10px] font-black uppercase text-muted-foreground ml-4">Reto #{currentQuestionIndex + 1}</span>
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
                  <p className="text-primary font-black uppercase tracking-widest text-xs mb-2">Pista del Tutor</p>
                  <p className="text-muted-foreground text-sm italic leading-relaxed">
                    Identifica el componente evaluado antes de responder. ¡Cada XP cuenta!
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
                        <h3 className="text-2xl font-black uppercase tracking-tight">{isCorrect ? '¡CORRECTO!' : 'FALLASTE'}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP GANADOS' : 'ANALIZA EL ERROR'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-5 bg-muted/40 rounded-2xl border border-primary/10">
                        <p className="font-black text-primary uppercase text-[10px] tracking-widest mb-3 flex items-center gap-2">
                          <Shield className="w-3 h-3" /> Justificación ICFES:
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
                          {isExplaining ? "Pensando..." : "Pedir Explicación IA"}
                          <BrainCircuit className="ml-2 w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <Button className="w-full game-button bg-primary text-white h-14 shadow-lg text-lg" onClick={handleNext}>
                      Siguiente Pregunta
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
