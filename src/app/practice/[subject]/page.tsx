
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Timer, Zap, Lightbulb, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function PracticeRoomPage({ params }: { params: { subject: string } }) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const { toast } = useToast();

  const handleCheck = () => {
    if (selectedOption === 2) { 
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

  const options = [
    "A) Aumenta la velocidad angular.",
    "B) Disminuye la fuerza de gravedad.",
    "C) Se mantiene constante debido a la inercia.",
    "D) El sistema colapsa instantáneamente."
  ];

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-6xl mx-auto p-6 flex flex-col gap-8">
        {/* Header Stats con Metadatos */}
        <div className="flex flex-col md:flex-row items-center justify-between bg-card p-6 rounded-3xl border-2 border-primary/10 shadow-sm gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-primary" />
              <span className="font-bold tabular-nums text-lg">12:45</span>
            </div>
            <div className="hidden md:block h-6 w-[2px] bg-muted" />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/20 text-primary font-bold uppercase tracking-widest text-[10px]">
                Componente: Físico
              </Badge>
              <Badge variant="outline" className="border-secondary/20 text-secondary font-bold uppercase tracking-widest text-[10px]">
                Competencia: Indagación
              </Badge>
              <Badge variant="outline" className="border-accent/20 text-accent font-bold uppercase tracking-widest text-[10px]">
                Nivel: II (Medio)
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Progreso</span>
              <div className="w-24">
                <Progress value={30} className="h-2" />
              </div>
              <span className="text-xs font-bold">3/10</span>
            </div>
            <div className="flex items-center gap-2">
              <Comodin icon={<Zap className="w-4 h-4" />} label="50/50" count={2} />
              <Comodin icon={<Lightbulb className="w-4 h-4" />} label="Pista" count={1} />
            </div>
          </div>
        </div>

        {/* Question Area */}
        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 game-card border-primary/20 shadow-xl overflow-hidden bg-card">
            <div className="bg-primary/5 p-8 border-b-2 border-primary/10">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Contexto Académico Saber 11</span>
              </div>
              <h2 className="text-2xl font-bold leading-relaxed text-foreground">
                ¿Qué sucede con el momento angular de un sistema si no actúan torques externos sobre él?
              </h2>
            </div>
            <CardContent className="p-8 space-y-4">
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => !isCorrect && setSelectedOption(idx)}
                  className={`w-full p-5 rounded-2xl border-2 text-left font-bold transition-all flex items-center justify-between group
                    ${selectedOption === idx ? 'border-primary bg-primary/5 shadow-md' : 'border-muted hover:border-primary/40 hover:bg-muted/30'}
                    ${isCorrect && idx === 2 ? 'border-secondary bg-secondary/10' : ''}
                    ${isCorrect === false && selectedOption === idx ? 'border-destructive bg-destructive/10' : ''}
                  `}
                >
                  <span className="flex-1">{opt}</span>
                  {isCorrect && idx === 2 && <CheckCircle2 className="text-secondary shrink-0 ml-4" />}
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
                <p className="text-muted-foreground text-sm font-medium">Responde la pregunta para que nuestra IA te explique el concepto oficial del ICFES.</p>
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
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{isCorrect ? '+50 XP' : 'Sigue intentando'}</p>
                    </div>
                  </div>
                  <div className="space-y-4 text-sm leading-relaxed">
                    <div className="p-4 bg-muted/50 rounded-2xl border border-primary/10">
                      <p className="font-bold text-primary uppercase text-[10px] tracking-widest mb-2">Análisis del ICFES:</p>
                      <p className="text-muted-foreground italic">
                        {isCorrect 
                          ? "Has identificado correctamente el principio de conservación del momento angular. Según la física clásica, si el torque externo neto es cero, la cantidad de rotación se mantiene sin cambios." 
                          : "Recuerda que la inercia rotacional y la velocidad angular se ajustan entre sí para mantener el momento angular constante cuando no hay fuerzas externas aplicadas."}
                      </p>
                    </div>
                    <div className="p-3 bg-accent/10 rounded-xl text-xs border border-accent/20 flex gap-2">
                      <Lightbulb className="w-4 h-4 text-accent shrink-0" />
                      <p><strong>Clave:</strong> En problemas de dinámica rotacional sin torques, el sistema es aislado.</p>
                    </div>
                  </div>
                  <Button className="w-full game-button bg-primary text-white h-12 shadow-lg" onClick={() => {
                    setIsCorrect(null);
                    setSelectedOption(null);
                  }}>
                    Siguiente Desafío
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
