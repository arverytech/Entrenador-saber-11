
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, limit } from 'firebase/firestore';
import { Timer, ArrowLeft, ArrowRight, ShieldCheck, Flag, AlertTriangle, Loader2, Target, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ExamSimulationPage({ params }: { params: { id: string } }) {
  const { user, firestore, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  
  // Cargamos preguntas para el simulacro (en un entorno real esto seleccionaría mix de materias)
  const examQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'questions'), limit(25));
  }, [firestore]);

  const { data: questions, isLoading } = useCollection(examQuery);
  
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(4.5 * 60 * 60); // 4.5 horas en segundos
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (timeLeft > 0 && !isFinished) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    }
    if (timeLeft === 0 && !isFinished) {
      handleFinish();
    }
  }, [timeLeft, isFinished]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelect = (idx: number) => {
    if (isFinished || !questions) return;
    setUserAnswers(prev => ({ ...prev, [questions[currentIdx].id]: idx }));
  };

  const handleFinish = () => {
    setIsFinished(true);
    toast({ title: "Simulacro Finalizado", description: "Tus respuestas han sido procesadas." });
  };

  const currentQ = questions?.[currentIdx];
  const progress = questions ? ((Object.keys(userAnswers).length) / questions.length) * 100 : 0;

  if (isLoading || isUserLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="font-black uppercase tracking-widest text-xs">Cargando Cuadernillo Maestro...</p>
      </div>
    );
  }

  if (isFinished) {
    const score = questions?.reduce((acc, q) => {
      return acc + (userAnswers[q.id] === q.correctAnswerIndex ? 1 : 0);
    }, 0) || 0;

    return (
      <div className="min-h-screen bg-background">
        <GameNavbar />
        <main className="max-w-4xl mx-auto p-10 flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
           <div className="w-32 h-32 bg-secondary/20 rounded-full flex items-center justify-center border-4 border-secondary shadow-2xl">
             <ShieldCheck className="w-16 h-16 text-secondary" />
           </div>
           <div className="text-center space-y-2">
             <h1 className="text-4xl font-black uppercase italic tracking-tighter">Misión Cumplida</h1>
             <p className="text-muted-foreground font-bold uppercase tracking-widest">Resultados de la {params.id.replace('-', ' ')}</p>
           </div>
           <Card className="w-full game-card border-secondary/20 bg-card overflow-hidden">
             <CardHeader className="bg-secondary/10 border-b-2 border-secondary/10 p-10 text-center">
                <p className="text-xs font-black uppercase text-secondary tracking-[0.3em] mb-2">Desempeño General</p>
                <h2 className="text-6xl font-black text-secondary">{Math.floor((score / (questions?.length || 1)) * 500)} / 500</h2>
             </CardHeader>
             <CardContent className="p-10 grid md:grid-cols-2 gap-8">
                <div className="p-6 bg-muted/30 rounded-3xl border space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Aciertos Reales</p>
                  <p className="text-3xl font-black">{score} de {questions?.length}</p>
                </div>
                <div className="p-6 bg-muted/30 rounded-3xl border space-y-2">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Tiempo Invertido</p>
                  <p className="text-3xl font-black">{formatTime((4.5 * 3600) - timeLeft)}</p>
                </div>
             </CardContent>
           </Card>
           <Button onClick={() => router.push('/exams')} className="game-button bg-primary text-white h-14 px-12 text-lg shadow-xl glow-primary">
             Volver al Centro de Misiones
           </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <div className="sticky top-[72px] z-40 bg-card border-b-2 border-primary/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase text-muted-foreground leading-none mb-1">Pregunta {currentIdx + 1} de {questions?.length}</p>
              <Progress value={progress} className="w-48 h-2 bg-muted rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-4 bg-muted/50 px-6 py-2 rounded-2xl border-2 border-primary/20">
            <Timer className="w-5 h-5 text-primary" />
            <span className="font-black text-xl tabular-nums text-primary">{formatTime(timeLeft)}</span>
          </div>
          <Button variant="outline" className="border-destructive text-destructive font-black h-10 hover:bg-destructive/10" onClick={handleFinish}>
            <Flag className="w-4 h-4 mr-2" /> ENTREGAR
          </Button>
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-6 mt-8">
        <Card className="game-card bg-card border-primary/20 shadow-2xl">
          <CardHeader className="p-10 border-b-2 border-primary/5 bg-primary/5">
             <div className="flex items-center gap-3 mb-4">
               <Badge className="bg-primary text-white font-black uppercase text-[9px]">{currentQ?.subjectId}</Badge>
               <Badge variant="outline" className="text-[9px] font-black uppercase">{currentQ?.componentId}</Badge>
             </div>
             <h2 className="text-3xl font-black uppercase italic leading-tight tracking-tight">
               {currentQ?.text || currentQ?.title}
             </h2>
          </CardHeader>
          <CardContent className="p-10 grid gap-4">
            {currentQ?.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`w-full p-8 rounded-[2rem] border-2 text-left font-bold transition-all flex items-center justify-between
                  ${userAnswers[currentQ.id] === i ? 'border-primary bg-primary/5 shadow-inner' : 'border-muted hover:bg-muted/50'}
                `}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-black
                    ${userAnswers[currentQ.id] === i ? 'bg-primary text-white border-primary' : 'bg-muted border-muted-foreground/20'}
                  `}>
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="text-lg italic">{opt}</span>
                </div>
                {userAnswers[currentQ.id] === i && <CheckCircle2 className="w-6 h-6 text-primary" />}
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-8">
          <Button 
            variant="ghost" 
            disabled={currentIdx === 0} 
            onClick={() => setCurrentIdx(prev => prev - 1)}
            className="game-button font-black uppercase text-xs h-12 px-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Pregunta Anterior
          </Button>
          <Button 
            className="game-button bg-primary text-white h-14 px-12 shadow-xl glow-primary"
            onClick={() => {
              if (currentIdx < (questions?.length || 0) - 1) {
                setCurrentIdx(prev => prev + 1);
              } else {
                handleFinish();
              }
            }}
          >
            {currentIdx === (questions?.length || 0) - 1 ? 'FINALIZAR EXAMEN' : 'SIGUIENTE PREGUNTA'}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </main>
    </div>
  );
}
