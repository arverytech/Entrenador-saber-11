
"use client";

import { GameNavbar } from '@/components/game-navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trophy, Clock, Target, Rocket, GraduationCap, Timer, ShieldCheck, ChevronRight, BookOpen, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ExamsHubPage() {
  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 p-10 bg-gradient-to-br from-primary via-primary/90 to-blue-600 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Trophy className="w-64 h-64 -rotate-12" />
          </div>
          <div className="relative z-10 space-y-4 max-w-2xl">
            <Badge className="bg-white/20 text-white border-none text-[10px] font-black uppercase tracking-widest px-4 py-1">Simulacros Reales Saber 11</Badge>
            <h1 className="text-5xl font-black uppercase italic tracking-tighter leading-none">Misiones de Gran Escala</h1>
            <p className="text-lg font-medium opacity-90">Entrenamiento de resistencia académica. Emula la experiencia real del ICFES en dos jornadas intensivas para medir tu nivel de héroe nacional.</p>
            <div className="flex flex-wrap gap-4 pt-4">
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/20">
                <Clock className="w-5 h-5" />
                <span className="text-sm font-bold uppercase tracking-tight">4.5 Horas por Sesión</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/20">
                <Target className="w-5 h-5" />
                <span className="text-sm font-bold uppercase tracking-tight">Puntaje Global 0-500</span>
              </div>
            </div>
          </div>
          <div className="relative z-10 bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 hidden lg:block">
            <GraduationCap className="w-24 h-24 text-white animate-pulse" />
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <SessionCard 
            id="jornada-1"
            title="Jornada 1: El Despertar"
            subjects={["Matemáticas", "Lectura Crítica", "Sociales y Ciudadanas", "Ciencias Naturales"]}
            questions={120}
            time="4:30 Horas"
            color="border-primary"
            bgIcon={<BookOpen className="text-primary/5" />}
            desc="Enfócate en el razonamiento cuantitativo y la comprensión lectora profunda. Es el inicio de tu camino al éxito."
          />
          <SessionCard 
            id="jornada-2"
            title="Jornada 2: La Conquista"
            subjects={["Sociales y Ciudadanas", "Ciencias Naturales", "Matemáticas", "Inglés", "Socioemocional"]}
            questions={125}
            time="4:30 Horas"
            color="border-accent"
            bgIcon={<Rocket className="text-accent/5" />}
            desc="Resistencia y dominio global. Incluye la evaluación de inglés y las competencias ciudadanas finales."
          />
        </div>

        <Card className="game-card border-dashed bg-muted/30 p-10 flex flex-col items-center text-center gap-6">
          <div className="bg-background p-4 rounded-3xl shadow-sm border-2 border-primary/10">
            <AlertCircle className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tight">Reglas de la Misión</h3>
            <p className="text-sm text-muted-foreground max-w-xl italic">
              Una vez inicias un simulacro, el cronómetro no se detiene. Debes responder con sinceridad para obtener un reporte preciso de tus debilidades. Al finalizar ambas jornadas, recibirás tu **Puntaje Estimado ICFES**.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}

function SessionCard({ id, title, subjects, questions, time, color, bgIcon, desc }: { id: string; title: string; subjects: string[]; questions: number; time: string; color: string; bgIcon: React.ReactNode; desc: string }) {
  return (
    <Card className={`group game-card border-2 ${color} bg-card shadow-xl hover:shadow-2xl transition-all`}>
      <div className="absolute top-0 right-0 p-8 scale-[3] pointer-events-none transition-transform group-hover:rotate-12">
        {bgIcon}
      </div>
      <CardHeader className="relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-3xl font-black uppercase italic tracking-tighter mb-2">{title}</CardTitle>
            <CardDescription className="text-sm font-bold uppercase tracking-widest text-muted-foreground">{questions} Preguntas Totales</CardDescription>
          </div>
          <div className="bg-muted p-3 rounded-2xl">
            <Timer className="w-6 h-6 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-6">
        <p className="text-sm text-muted-foreground leading-relaxed italic">{desc}</p>
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Contenido de la Sesión:</p>
          <div className="flex flex-wrap gap-2">
            {subjects.map(sub => (
              <Badge key={sub} variant="outline" className="text-[9px] font-black uppercase tracking-tight py-1">{sub}</Badge>
            ))}
          </div>
        </div>
        <div className="pt-4 flex items-center justify-between border-t border-muted">
          <div className="flex items-center gap-2 text-primary font-black uppercase text-xs">
            <Clock className="w-4 h-4" />
            {time}
          </div>
          <Button className="game-button bg-primary text-white h-12 px-8 shadow-lg glow-primary group-hover:scale-[1.05] transition-transform" asChild>
             <Link href={`/exams/${id}`}>
               Iniciar Simulación <ChevronRight className="ml-2 w-5 h-5" />
             </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
