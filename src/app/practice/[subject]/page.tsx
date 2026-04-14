
"use client";

import { useState, useMemo } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Timer, Zap, Lightbulb, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

// Datos de ejemplo para cada materia siguiendo el estándar ICFES
const SUBJECT_DATA: Record<string, any> = {
  matematicas: {
    title: "¿Cuál es el resultado de resolver la ecuación 2x + 5 = 13?",
    options: ["A) x = 3", "B) x = 4", "C) x = 8", "D) x = 9"],
    correctIndex: 1,
    component: "Aleatorio / Variacional",
    competency: "Formulación y Ejecución",
    level: "I (Básico)",
    explanation: "Para despejar x, restamos 5 de ambos lados (13-5=8) y luego dividimos por 2 (8/2=4).",
    fact: "El álgebra es la base para entender el cambio en el mundo real."
  },
  lectura: {
    title: "En un texto argumentativo, ¿cuál es la función principal de la tesis?",
    options: ["A) Narrar una historia.", "B) Describir un paisaje.", "C) Presentar la postura del autor.", "D) Listar datos estadísticos."],
    correctIndex: 2,
    component: "Reflexivo / Crítico",
    competency: "Reflexión sobre el contenido",
    level: "II (Medio)",
    explanation: "La tesis es la columna vertebral de un argumento; es la idea que el autor busca defender o demostrar.",
    fact: "Leer críticamente te ayuda a no ser engañado por noticias falsas."
  },
  naturales: {
    title: "¿Qué sucede con el momento angular de un sistema si no actúan torques externos?",
    options: ["A) Aumenta la velocidad.", "B) Disminuye la gravedad.", "C) Se mantiene constante.", "D) El sistema colapsa."],
    correctIndex: 2,
    component: "Físico / CTS",
    competency: "Explicación de fenómenos",
    level: "II (Medio)",
    explanation: "Este es el principio de conservación del momento angular: sin torques, no hay cambio en la rotación.",
    fact: "Esto explica por qué los planetas giran alrededor del sol por miles de millones de años."
  },
  sociales: {
    title: "¿Cuál es el mecanismo de participación que permite a los ciudadanos elegir a sus gobernantes?",
    options: ["A) El plebiscito.", "B) El referendo.", "C) El voto.", "D) La consulta popular."],
    correctIndex: 2,
    component: "Pensamiento Social",
    competency: "Multiperspectivismo",
    level: "I (Básico)",
    explanation: "El voto es el derecho y deber fundamental en una democracia para elegir representantes.",
    fact: "En Colombia, el voto es secreto y es la base de nuestra democracia."
  },
  ingles: {
    title: "Choose the correct form: 'She ________ to the park every morning.'",
    options: ["A) go", "B) goes", "C) going", "D) gone"],
    correctIndex: 1,
    component: "Uso Funcional",
    competency: "Lingüística",
    level: "A2 (Básico)",
    explanation: "Para la tercera persona del singular (She) en presente simple, añadimos 'es' al verbo 'go'.",
    fact: "El inglés es el idioma más hablado en el mundo de la ciencia y la tecnología."
  },
  socioemocional: {
    title: "Si un compañero está siendo excluido de un grupo, ¿cuál es la acción más empática?",
    options: ["A) Ignorar la situación.", "B) Unirse a la exclusión.", "C) Invitarlo a integrarse.", "D) Decirle que no importa."],
    correctIndex: 2,
    component: "Convivencia y Paz",
    competency: "Empatía",
    level: "I (Ciudadano)",
    explanation: "La empatía implica reconocer el sentimiento del otro y actuar para mejorar su bienestar social.",
    fact: "Las habilidades socioemocionales son las más valoradas por las empresas modernas."
  }
};

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const { toast } = useToast();

  const currentSubject = params.subject.toLowerCase();
  const data = useMemo(() => SUBJECT_DATA[currentSubject] || SUBJECT_DATA['matematicas'], [currentSubject]);

  const handleCheck = () => {
    if (selectedOption === data.correctIndex) { 
      setIsCorrect(true);
      toast({
        title: "¡Respuesta Correcta!",
        description: "+50 Puntos de Experiencia ganados.",
      });
    } else {
      setIsCorrect(false);
      toast({
        title: "Intenta de nuevo",
        description: "Revisa la explicación para entender el concepto.",
        variant: "destructive",
      });
    }
  };

  const handleNext = () => {
    setIsCorrect(null);
    setSelectedOption(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        {/* Header Stats con Metadatos del ICFES */}
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-primary" />
              <span className="font-bold tabular-nums text-lg">12:45</span>
            </div>
            <div className="hidden md:block h-6 w-[2px] bg-muted" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 text-primary font-bold uppercase tracking-widest text-[10px]">
                Componente: {data.component}
              </Badge>
              <Badge variant="outline" className="border-secondary/20 text-secondary font-bold uppercase tracking-widest text-[10px]">
                Competencia: {data.competency}
              </Badge>
              <Badge variant="outline" className="border-accent/20 text-accent font-bold uppercase tracking-widest text-[10px]">
                Nivel: {data.level}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Progreso Misión</span>
              <div className="w-24">
                <Progress value={30} className="h-2" />
              </div>
              <span className="text-xs font-bold">3/10</span>
            </div>
            <div className="flex items-center gap-2">
              <Comodin icon={<Zap className="w-4 h-4" />} label="50/50" count={2} />
              <Comodin icon={<Lightbulb className="w-4 h-4" />} label="Pista IA" count={1} />
            </div>
          </div>
        </div>

        {/* Question Area */}
        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 game-card border-primary/20 shadow-xl overflow-hidden bg-card">
            <div className="bg-primary/5 p-8 border-b-2 border-primary/10">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Contexto Oficial Saber 11</span>
              </div>
              <h2 className="text-2xl font-bold leading-relaxed text-foreground">
                {data.title}
              </h2>
            </div>
            <CardContent className="p-8 space-y-4">
              {data.options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => !isCorrect && setSelectedOption(idx)}
                  className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selectedOption === idx ? 'border-primary bg-primary/5 shadow-md' : 'border-muted hover:border-primary/40 hover:bg-muted/30'}
                    ${isCorrect && idx === data.correctIndex ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1">{opt}</span>
                  {isCorrect && idx === data.correctIndex && <CheckCircle2 className="text-secondary shrink-0 ml-4" />}
                  {isCorrect === false && selectedOption === idx && <AlertCircle className="text-destructive shrink-0 ml-4" />}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Feedback & AI Explanation Column */}
          <div className="space-y-6">
            {isCorrect === null ? (
              <div className="p-8 rounded-3xl bg-muted/20 border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center text-center gap-4 h-full min-h-[300px]">
                <Sparkles className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm font-medium uppercase font-bold tracking-widest">
                  Área: {params.subject}
                </p>
                <p className="text-muted-foreground text-xs italic">Responde para desbloquear el análisis de la IA y subir de nivel.</p>
                <Button 
                  className="game-button bg-primary w-full h-12 text-white shadow-lg glow-primary" 
                  disabled={selectedOption === null}
                  onClick={handleCheck}
                >
                  Verificar Respuesta
                </Button>
              </div>
            ) : (
              <Card className={`game-card border-2 animate-in fade-in slide-in-from-right-4 bg-card ${isCorrect ? 'border-secondary/40 glow-secondary' : 'border-destructive/40 shadow-destructive/10'}`}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${isCorrect ? 'bg-secondary text-white' : 'bg-destructive text-white'}`}>
                      {isCorrect ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">{isCorrect ? '¡Correcto!' : 'Incorrecto'}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP Ganados' : 'Vuelve a intentarlo'}</p>
                    </div>
                  </div>
                  <div className="space-y-4 text-sm leading-relaxed">
                    <div className="p-4 bg-muted/50 rounded-2xl border border-primary/10">
                      <p className="font-bold text-primary uppercase text-[10px] tracking-widest mb-2">Explicación del Entrenador:</p>
                      <p className="text-muted-foreground italic">
                        {isCorrect ? `¡Excelente trabajo! ${data.explanation}` : `No te desanimes. ${data.explanation}`}
                      </p>
                    </div>
                    <div className="p-3 bg-accent/10 rounded-xl text-xs border border-accent/20 flex gap-2">
                      <Lightbulb className="w-4 h-4 text-accent shrink-0" />
                      <p><strong>¿Sabías que?</strong> {data.fact}</p>
                    </div>
                  </div>
                  <Button className="w-full game-button bg-primary text-white h-12 shadow-lg" onClick={handleNext}>
                    Siguiente Pregunta
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Comodin({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1 group cursor-pointer">
      <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">{label}</span>
        <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-black">{count}</span>
      </div>
    </div>
  );
}
