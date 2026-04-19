
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trophy, Flame, Target, BookOpen, Star, Zap, GraduationCap, Clock, BrainCircuit, Sparkles, ShieldCheck, Loader2, Sword } from 'lucide-react';
import Link from 'next/link';
import { useUser, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, limit, orderBy } from 'firebase/firestore';
import { adaptLearningPath, type AdaptiveLearningPathOutput } from '@/ai/flows/adaptive-learning-path';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const { user, isUserLoading, firestore } = useUser();
  const router = useRouter();
  const [aiMission, setAiMission] = useState<AdaptiveLearningPathOutput | null>(null);
  const [isGeneratingMission, setIsGeneratingMission] = useState(false);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const attemptsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.uid, 'quizAttempts'), orderBy('timestamp', 'desc'), limit(50));
  }, [firestore, user]);

  const { data: userData, isLoading: isDataLoading } = useDoc(userDocRef);
  const { data: attempts } = useCollection(attemptsQuery);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  const radarData = useMemo(() => {
    if (!attempts) return [];
    
    const subjects = [
      { id: 'matematicas', label: 'Matemáticas' },
      { id: 'lectura', label: 'Lectura' },
      { id: 'naturales', label: 'Naturales' },
      { id: 'sociales', label: 'Sociales' },
      { id: 'ingles', label: 'Inglés' },
      { id: 'socioemocional', label: 'Socioemoc' }
    ];

    return subjects.map(s => {
      const subjectAttempts = attempts.filter(a => a.subject === s.id);
      const total = subjectAttempts.length;
      const correct = subjectAttempts.filter(a => a.isCorrect).length;
      const score = total > 0 ? (correct / total) * 100 : 0;
      return { subject: s.label, A: Math.max(20, score), full: 100 };
    });
  }, [attempts]);

  const generateMission = async () => {
    if (!user) return;
    setIsGeneratingMission(true);
    try {
      const performanceData = attempts && attempts.length > 0 
        ? JSON.stringify(attempts.map(a => ({ subject: a.subject, isCorrect: a.isCorrect })))
        : "Usuario nuevo sin historial. Iniciar con fundamentos básicos.";
      
      const mission = await adaptLearningPath({
        studentPerformanceData: performanceData,
        userGoal: "Dominar todas las áreas del Saber 11 y alcanzar el Nivel de Héroe",
        currentContext: "Inicio de fase de entrenamiento intensivo"
      });
      setAiMission(mission);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingMission(false);
    }
  };

  if (isUserLoading || isDataLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="animate-bounce bg-primary p-4 rounded-3xl shadow-xl">
          <GraduationCap className="w-12 h-12 text-white" />
        </div>
        <p className="font-black uppercase tracking-[0.2em] text-primary text-xs animate-pulse">Sincronizando Perfil de Héroe...</p>
      </div>
    );
  }

  const points = userData?.currentPoints ?? 0;
  const level = Math.floor(points / 500) + 1;
  const xpProgress = (points % 500) / 5; 
  
  const trialEndDate = userData?.trialEndDate ? new Date(userData.trialEndDate) : null;
  const now = new Date();
  const daysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {userData?.isTrial && (
          <div className="bg-orange-500/10 border-2 border-orange-500/30 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-orange-500 p-2 rounded-xl text-white shadow-lg">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black text-orange-600 uppercase tracking-tight text-sm">Prueba Gratuita: {daysLeft} días restantes</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Valida tu código institucional para acceso ilimitado.</p>
              </div>
            </div>
            <Button variant="outline" className="game-button border-orange-500 text-orange-600 font-black hover:bg-orange-500 hover:text-white" asChild>
              <Link href="/profile">Validar Código</Link>
            </Button>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2 p-10 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-blue-600 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldCheck className="w-48 h-48 -rotate-12" />
            </div>
            <div className="relative z-10 space-y-6">
              <div>
                <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter">
                  ¡Hola, {userData?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Aspirante'}!
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-white/20 text-white border-none text-[10px] px-3 font-bold uppercase tracking-widest">Rango: {userData?.role === 'admin' ? 'Comandante' : 'Estudiante'}</Badge>
                  <span className="text-primary-foreground/80 font-bold uppercase text-[10px] tracking-[0.3em]">
                    Nivel {level} • {points} XP Acumulados
                  </span>
                </div>
              </div>
              <p className="text-lg opacity-90 font-medium max-w-sm">Tu camino al éxito académico empieza hoy. ¿Listo para la siguiente misión?</p>
              <div className="flex gap-4">
                <Button className="game-button bg-white text-primary hover:bg-white/90 shadow-xl px-8 h-12" asChild>
                  <Link href="/practice">Ir al Banco de Preguntas</Link>
                </Button>
              </div>
            </div>
          </div>

          <StatCard icon={<Flame className="w-6 h-6 text-orange-500" />} label="Racha Actual" value={attempts?.length ? "1 Día" : "0 Días"} color="bg-orange-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="Puntos Totales" value={points.toString()} color="bg-yellow-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3 text-primary">
                <BrainCircuit className="w-6 h-6" />
                Misión Adaptativa IA
              </h3>
              {!aiMission ? (
                <Card className="game-card bg-primary/5 border-primary/20 p-8 border-dashed flex flex-col items-center justify-center text-center gap-6">
                  <Sparkles className="w-8 h-8 text-accent" />
                  <div className="space-y-2">
                    <h4 className="font-bold text-lg uppercase tracking-tight">Analizar mi Desempeño</h4>
                    <p className="text-xs text-muted-foreground max-w-sm italic">Nuestra IA revisará tus últimos intentos para crear una misión que fortalezca tus debilidades.</p>
                  </div>
                  <Button onClick={generateMission} disabled={isGeneratingMission} className="game-button bg-primary text-white h-12 px-10">
                    {isGeneratingMission ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Generar Misión Personalizada"}
                  </Button>
                </Card>
              ) : (
                <Card className="game-card bg-card border-accent/30 p-8">
                  <div className="flex flex-col md:flex-row gap-8 items-start">
                    <Target className="w-10 h-10 text-accent" />
                    <div className="flex-1 space-y-6">
                      <h4 className="text-2xl font-black uppercase italic leading-none">{aiMission.recommendationType === 'mission' ? 'Misión Especial' : 'Sugerencia de Estudio'}</h4>
                      <div className="space-y-4">
                        {aiMission.recommendations.map((rec, i) => (
                          <div key={i} className="flex gap-3 p-4 bg-muted/30 rounded-2xl border text-sm font-bold">
                            <Zap className="w-4 h-4 text-accent shrink-0" />
                            <p>{rec.text}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm italic text-muted-foreground">"{aiMission.motivationMessage}"</p>
                      <Button className="game-button bg-accent text-white h-12 px-8" asChild>
                        <Link href="/practice">Aceptar Desafío</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </section>

            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3 text-secondary">
                <Sword className="w-6 h-6" />
                Radar de Poder Académico
              </h3>
              <Card className="game-card border-secondary/20 bg-card p-6 min-h-[400px]">
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                      <PolarGrid stroke="hsl(var(--muted-foreground))" strokeOpacity={0.2} />
                      <PolarAngleAxis 
                        dataKey="subject" 
                        tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 'bold' }} 
                      />
                      <Radar
                        name="Rendimiento"
                        dataKey="A"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.4}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center mt-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Desempeño basado en tus últimos 50 intentos</p>
                </div>
              </Card>
            </section>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
              <Star className="text-accent w-6 h-6" />
              Nivel Heroico
            </h3>
            <Card className="game-card border-accent/20 shadow-xl bg-card">
              <CardContent className="p-8 space-y-8 text-center">
                <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
                   <div className="absolute inset-0 rounded-full border-[12px] border-muted" />
                   <div className="flex flex-col items-center">
                      <span className="text-6xl font-black text-foreground italic leading-none">{level}</span>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Nivel</span>
                   </div>
                </div>
                <div className="space-y-4">
                  <Progress value={xpProgress} className="h-3 rounded-full bg-muted" />
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest bg-muted/50 py-2 rounded-xl">
                    Próximo Nivel en {500 - (points % 500)} XP
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className="game-card border-primary/10 hover:border-primary/40 shadow-sm transition-all bg-card">
      <CardContent className="p-8 flex items-center gap-5">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-black tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
