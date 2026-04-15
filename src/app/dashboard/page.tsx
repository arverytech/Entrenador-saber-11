
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Trophy, Flame, Target, BookOpen, Star, ArrowRight, Zap, GraduationCap, Clock, BrainCircuit, Sparkles, ShieldCheck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useUser, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, collection, query, limit, orderBy } from 'firebase/firestore';
import { adaptLearningPath, type AdaptiveLearningPathOutput } from '@/ai/flows/adaptive-learning-path';

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
    return query(collection(firestore, 'users', user.uid, 'quizAttempts'), orderBy('timestamp', 'desc'), limit(10));
  }, [firestore, user]);

  const { data: userData, isLoading: isDataLoading } = useDoc(userDocRef);
  const { data: attempts } = useCollection(attemptsQuery);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  const generateMission = async () => {
    if (!user) return;
    setIsGeneratingMission(true);
    try {
      const performanceData = attempts && attempts.length > 0 
        ? JSON.stringify(attempts.map(a => ({ subject: a.subject, isCorrect: a.isCorrect })))
        : "Usuario sin historial previo";
      
      const mission = await adaptLearningPath({
        studentPerformanceData: performanceData,
        userGoal: "Dominar todas las áreas del Saber 11",
        currentContext: "Inicio de entrenamiento"
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

  // Lógica de progreso REAL (Estudiante empieza en 0)
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
          <div className="bg-orange-500/10 border-2 border-orange-500/30 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="bg-orange-500 p-2 rounded-xl text-white shadow-lg">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="font-black text-orange-600 uppercase tracking-tight text-sm">Prueba Gratuita: {daysLeft} días restantes</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Activa tu clave institucional para no perder tus medallas.</p>
              </div>
            </div>
            <Button variant="outline" className="game-button border-orange-500 text-orange-600 font-black hover:bg-orange-500 hover:text-white" asChild>
              <Link href="/profile">Validar Clave</Link>
            </Button>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2 p-10 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-blue-600 text-white relative overflow-hidden glow-primary shadow-2xl">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <ShieldCheck className="w-48 h-48 -rotate-12" />
            </div>
            <div className="relative z-10 space-y-6">
              <div>
                <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter">
                  ¡Hola, {userData?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Aspirante'}!
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-white/20 text-white border-none text-[10px] px-3 font-bold uppercase tracking-widest">Nivel {level}</Badge>
                  <span className="text-primary-foreground/80 font-bold uppercase text-[10px] tracking-[0.3em]">
                    {userData?.role === 'admin' ? 'Comandante Académico' : 'Héroe en Entrenamiento'}
                  </span>
                </div>
              </div>
              <p className="text-lg opacity-90 font-medium max-w-sm">Tu entrenamiento real comienza aquí. Tienes <strong>{points} XP</strong> acumulados.</p>
              <div className="flex gap-4">
                <Button className="game-button bg-white text-primary hover:bg-white/90 shadow-xl px-8 h-12" asChild>
                  <Link href="/practice">Empezar Misión</Link>
                </Button>
              </div>
            </div>
          </div>

          <StatCard icon={<Flame className="w-6 h-6 text-orange-500" />} label="Días en Racha" value={attempts?.length ? "1" : "0"} color="bg-orange-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="XP Total" value={points.toString()} color="bg-yellow-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3 text-primary">
                  <BrainCircuit className="w-6 h-6" />
                  Misión Adaptativa IA
                </h3>
              </div>

              {!aiMission ? (
                <Card className="game-card bg-primary/5 border-primary/20 p-8 border-dashed flex flex-col items-center justify-center text-center gap-6">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-primary/10">
                    <Sparkles className="w-8 h-8 text-accent" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-lg uppercase tracking-tight">Generar Misión Personalizada</h4>
                    <p className="text-xs text-muted-foreground max-w-sm italic">
                      Nuestra IA analizará tus aciertos para recomendarte en qué áreas enfocarte hoy.
                    </p>
                  </div>
                  <Button 
                    onClick={generateMission} 
                    disabled={isGeneratingMission}
                    className="game-button bg-primary text-white h-12 px-10 shadow-lg glow-primary"
                  >
                    {isGeneratingMission ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Analizando...</> : "Analizar y Crear Misión"}
                  </Button>
                </Card>
              ) : (
                <Card className="game-card bg-card border-accent/30 glow-accent p-8 animate-in zoom-in-95 duration-500">
                  <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="bg-accent/10 p-5 rounded-3xl text-accent border border-accent/20">
                      <Target className="w-10 h-10" />
                    </div>
                    <div className="flex-1 space-y-6">
                      <div>
                        <Badge className="bg-accent text-white uppercase font-black text-[9px] mb-2">Recomendación IA</Badge>
                        <h4 className="text-2xl font-black uppercase italic leading-none">Tu Ruta de Heroe</h4>
                      </div>
                      <div className="space-y-4">
                        {aiMission.recommendations.map((rec, i) => (
                          <div key={i} className="flex gap-3 p-4 bg-muted/30 rounded-2xl border border-muted-foreground/10 text-sm font-bold">
                            <Zap className="w-4 h-4 text-accent shrink-0" />
                            <p>{rec.text}</p>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 bg-primary/5 rounded-2xl border-l-4 border-primary">
                        <p className="text-xs font-bold text-primary uppercase italic mb-1">Feedback del Tutor:</p>
                        <p className="text-sm italic text-muted-foreground">"{aiMission.motivationMessage}"</p>
                      </div>
                      <Button className="game-button bg-accent text-white h-12 px-8 shadow-lg" asChild>
                        <Link href="/practice">Aceptar Desafío</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
            </section>

            <section className="space-y-6">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                <Target className="text-primary w-6 h-6" />
                Entrenamiento por Área
              </h3>
              <div className="grid gap-4">
                <MissionCard title="Dominio Matemático" subject="Matemáticas" progress={Math.min(100, (points / 10))} reward="+50 XP" icon={<Zap className="w-5 h-5" />} link="/practice/matematicas" />
                <MissionCard title="Lectura Crítica" subject="Lectura Crítica" progress={0} reward="+50 XP" icon={<BookOpen className="w-5 h-5" />} link="/practice/lectura" />
                <MissionCard title="Desafío Ciudadano" subject="Socioemocional" progress={0} reward="+50 XP" icon={<ShieldCheck className="w-5 h-5" />} link="/practice/socioemocional" />
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
              <Star className="text-accent w-6 h-6" />
              Progreso Real
            </h3>
            <Card className="game-card border-accent/20 shadow-xl bg-card">
              <CardContent className="p-8 space-y-8 text-center">
                <div className="relative w-44 h-44 mx-auto">
                  <div className="absolute inset-0 rounded-full border-[12px] border-muted shadow-inner" />
                  <div className="absolute inset-0 rounded-full border-[12px] border-accent border-t-transparent transition-all duration-1000" style={{ transform: `rotate(${xpProgress * 3.6}deg)` }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-6xl font-black text-foreground italic leading-none">{level}</span>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mt-1">Nivel</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                      <span>XP para Nivel {level + 1}</span>
                      <span className="text-accent">{Math.floor(xpProgress)}%</span>
                    </div>
                    <Progress value={xpProgress} className="h-3 rounded-full bg-muted" />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest bg-muted/50 py-2 rounded-xl">
                    Faltan {500 - (points % 500)} XP para subir
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
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{label}</p>
          <p className="text-3xl font-black tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MissionCard({ title, subject, progress, reward, icon, link }: { title: string; subject: string; progress: number; reward: string; icon: React.ReactNode, link: string }) {
  return (
    <Link href={link} className="block game-card bg-card p-6 border-muted group cursor-pointer hover:border-primary/40 hover:shadow-xl transition-all">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
            {icon}
          </div>
          <div>
            <h4 className="font-black text-xl leading-none uppercase tracking-tighter">{title}</h4>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{subject}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-secondary bg-secondary/10 px-4 py-1 rounded-full border border-secondary/20">{reward}</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex-1">
          <Progress value={progress} className="h-2 rounded-full" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs font-black tabular-nums">{progress}%</span>
          <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-all" />
        </div>
      </div>
    </Link>
  );
}
