
"use client";

import { useState, useMemo, useEffect } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Timer, Zap, Lightbulb, AlertCircle, CheckCircle2, Shield, BrainCircuit, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, increment, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { generateExplanation } from '@/ai/flows/dynamic-answer-explanations-flow';

// BANCO DE DATOS TÉCNICO ALINEADO CON ICFES 2024
const SUBJECT_DATA: Record<string, any[]> = {
  matematicas: [
    {
      id: "math_01",
      title: "En una bolsa hay 3 bolas rojas, 2 azules y 5 verdes. Si se extrae una bola al azar, ¿cuál es la probabilidad de que NO sea verde?",
      options: ["A) 1/2", "B) 3/10", "C) 1/5", "D) 2/3"],
      correctIndex: 0,
      component: "Aleatorio (Probabilidad)",
      competency: "Interpretación y Representación",
      level: "II (Medio)",
      explanation: "El total de bolas es 10. Las que NO son verdes son las rojas (3) y azules (2), total 5. Probabilidad = 5/10 = 1/2.",
      fact: "La probabilidad es clave para la toma de decisiones financieras."
    }
  ],
  lectura: [
    {
      id: "lc_01",
      title: "Si un autor utiliza ironía para criticar una política pública, ¿cuál es su intención comunicativa principal?",
      options: ["A) Informar datos objetivos.", "B) Ridiculizar una postura.", "C) Describir un proceso legal.", "D) Elogiar a los gobernantes."],
      correctIndex: 1,
      component: "Reflexivo - Pragmático",
      competency: "Reflexión sobre el contenido y la forma",
      level: "III (Avanzado)",
      explanation: "La ironía es una figura retórica que busca dar a entender lo contrario de lo que se dice, frecuentemente con fines satíricos o críticos.",
      fact: "Identificar la intención del autor es la habilidad más evaluada en Lectura Crítica."
    }
  ],
  naturales: [
    {
      id: "cn_01",
      title: "En un ecosistema, ¿qué sucede con la energía disponible a medida que se avanza en los niveles tróficos (de productores a consumidores)?",
      options: ["A) Aumenta exponencialmente.", "B) Se mantiene constante.", "C) Disminuye progresivamente.", "D) Se duplica en cada nivel."],
      correctIndex: 2,
      component: "Biológico (Ecosistemas)",
      competency: "Explicación de fenómenos",
      level: "II (Medio)",
      explanation: "Debido a la ley del diezmo ecológico, solo el 10% de la energía se transfiere al siguiente nivel; el resto se pierde en calor y procesos vitales.",
      fact: "Sin plantas (productores), toda la pirámide energética colapsaría."
    }
  ],
  sociales: [
    {
      id: "soc_01",
      title: "¿Qué rama del poder público en Colombia es la encargada de dictar las leyes y reformar la Constitución?",
      options: ["A) Ejecutiva", "B) Judicial", "C) Legislativa", "D) Ciudadana"],
      correctIndex: 2,
      component: "Pensamiento Social (Estado)",
      competency: "Pensamiento Social",
      level: "I (Básico)",
      explanation: "El Congreso de la República (Senado y Cámara) conforma la rama legislativa y su función es crear leyes.",
      fact: "Conocer las ramas del poder es vital para el ejercicio de la ciudadanía."
    }
  ],
  ingles: [
    {
      id: "eng_01",
      title: "Choose the correct sentence: 'If I __________ more money, I would buy a new car.'",
      options: ["A) have", "B) had", "C) will have", "D) am having"],
      correctIndex: 1,
      component: "Uso Funcional (Grammar)",
      competency: "Lingüística (Second Conditional)",
      level: "B1 (Intermedio)",
      explanation: "El segundo condicional usa 'if' + past simple para situaciones hipotéticas en el presente.",
      fact: "El dominio del 'Second Conditional' es común en las partes 4 y 6 del examen de inglés."
    }
  ],
  socioemocional: [
    {
      id: "se_01",
      title: "Un compañero de clase cometió un error en una exposición y todos se ríen. Tú notas que él está muy avergonzado. ¿Qué acción demuestra regulación emocional?",
      options: ["A) Reírte también para encajar.", "B) Salir del salón sin decir nada.", "C) Esperar a que se calme y ofrecerle apoyo.", "D) Gritarles a todos que se callen."],
      correctIndex: 2,
      component: "Empatía y Convivencia",
      competency: "Manejo de Emociones / Empatía",
      level: "I (Ciudadano)",
      explanation: "La regulación emocional implica procesar la situación y actuar de manera constructiva para uno mismo y para los demás.",
      fact: "Estas preguntas no restan puntos, pero definen tu perfil ciudadano ante el ICFES."
    }
  ]
};

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  
  const { user, firestore } = useUser();
  const { toast } = useToast();

  const currentSubject = params.subject.toLowerCase();
  const questions = useMemo(() => SUBJECT_DATA[currentSubject] || SUBJECT_DATA['matematicas'], [currentSubject]);
  const currentQuestion = questions[currentQuestionIndex];

  const handleCheck = async () => {
    if (selectedOption === null) return;
    
    const correct = selectedOption === currentQuestion.correctIndex;
    setIsCorrect(correct);

    if (correct) {
      toast({ title: "¡Excelente!", description: "+50 Puntos de Experiencia." });
      if (user && firestore) {
        const userRef = doc(firestore, 'users', user.uid);
        updateDocumentNonBlocking(userRef, { currentPoints: increment(50) });
      }
    } else {
      toast({ title: "¡Sigue intentando!", description: "Revisa la solución técnica.", variant: "destructive" });
    }

    // REGISTRO PROFUNDO DE INTENTO
    if (user && firestore) {
      const attemptsRef = collection(firestore, 'users', user.uid, 'quizAttempts');
      addDoc(attemptsRef, {
        questionId: currentQuestion.id,
        subject: currentSubject,
        isCorrect: correct,
        selectedAnswer: selectedOption,
        timestamp: serverTimestamp(),
        component: currentQuestion.component,
        competency: currentQuestion.competency
      });
    }
  };

  const handleAiExplanation = async () => {
    setIsExplaining(true);
    try {
      const result = await generateExplanation({
        question: currentQuestion.title,
        userAnswer: currentQuestion.options[selectedOption!],
        correctAnswer: currentQuestion.options[currentQuestion.correctIndex],
        context: `Materia: ${currentSubject}, Componente: ${currentQuestion.component}`
      });
      setAiExplanation(result.explanation);
    } catch (e) {
      console.error(e);
    } finally {
      setIsExplaining(false);
    }
  };

  const handleNext = () => {
    setIsCorrect(null);
    setSelectedOption(null);
    setAiExplanation("");
    // En un banco real, aquí avanzaríamos el índice
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        {/* HEADER TÉCNICO */}
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-primary">
              <Timer className="w-5 h-5" />
              <span className="font-bold tabular-nums text-lg">Sesión Activa</span>
            </div>
            <div className="hidden md:block h-6 w-[2px] bg-muted" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary font-bold text-[10px] uppercase">
                {currentQuestion.component}
              </Badge>
              <Badge variant="outline" className="bg-secondary/5 border-secondary/20 text-secondary font-bold text-[10px] uppercase">
                {currentQuestion.competency}
              </Badge>
              <Badge variant="outline" className="bg-accent/5 border-accent/20 text-accent font-bold text-[10px] uppercase">
                Nivel {currentQuestion.level}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-muted rounded-2xl text-[10px] font-black uppercase tracking-widest opacity-60">
              ID: {currentQuestion.id}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* PREGUNTA */}
          <Card className="lg:col-span-2 game-card border-primary/20 shadow-xl overflow-hidden bg-card">
            <div className="bg-gradient-to-r from-primary/5 to-transparent p-10 border-b-2 border-primary/10">
              <h2 className="text-2xl md:text-3xl font-bold leading-snug text-foreground">
                {currentQuestion.title}
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
                    ${isCorrect && idx === currentQuestion.correctIndex ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1 text-lg">{opt}</span>
                  {isCorrect && idx === currentQuestion.correctIndex && <CheckCircle2 className="text-secondary shrink-0 ml-4 w-6 h-6" />}
                  {isCorrect === false && selectedOption === idx && <AlertCircle className="text-destructive shrink-0 ml-4 w-6 h-6" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* LATERAL: ANÁLISIS E IA */}
          <div className="space-y-6">
            {isCorrect === null ? (
              <div className="p-10 rounded-3xl bg-card border-2 border-dashed border-primary/20 flex flex-col items-center justify-center text-center gap-6 h-full min-h-[400px]">
                <div className="bg-primary/10 p-4 rounded-full">
                  <BrainCircuit className="w-12 h-12 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-primary font-black uppercase tracking-widest text-xs mb-2">Entrenador Saber 11</p>
                  <p className="text-muted-foreground text-sm italic leading-relaxed">
                    Analiza cuidadosamente las opciones. Recuerda que el ICFES evalúa competencias, no solo memoria.
                  </p>
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
                <Card className={`game-card border-2 ${isCorrect ? 'border-secondary/40 glow-secondary' : 'border-destructive/40 shadow-destructive/10'}`}>
                  <CardContent className="p-8 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                        {isCorrect ? <CheckCircle2 className="w-8 h-8" /> : <AlertCircle className="w-8 h-8" />}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black uppercase tracking-tight">{isCorrect ? '¡CORRECTO!' : 'INCORRECTO'}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP PARA TU AVATAR' : 'REVISA LA JUSTIFICACIÓN'}</p>
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
                            <Sparkles className="w-3 h-3 text-accent" /> Análisis IA Personalizado:
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
                          {isExplaining ? "Generando análisis..." : "Solicitar análisis a la IA"}
                          <BrainCircuit className="ml-2 w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    <Button className="w-full game-button bg-primary text-white h-14 shadow-lg text-lg" onClick={handleNext}>
                      Siguiente Misión
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
