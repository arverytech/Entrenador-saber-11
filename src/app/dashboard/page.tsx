
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Flame, Target, BookOpen, Star, ArrowRight, Zap, GraduationCap, Clock } from 'lucide-react';
import Link from 'next/link';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function DashboardPage() {
  const { user, isUserLoading, firestore } = useUser();
  const router = useRouter();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isDataLoading } = useDoc(userDocRef);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || isDataLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="animate-bounce bg-primary p-4 rounded-3xl shadow-xl">
          <GraduationCap className="w-12 h-12 text-white" />
        </div>
        <p className="font-black uppercase tracking-[0.2em] text-primary text-xs animate-pulse">Cargando tu progreso...</p>
      </div>
    );
  }

  const points = userData?.currentPoints || 0;
  const level = Math.floor(points / 500) + 1;
  const xpProgress = (points % 500) / 5;
  
  const trialEndDate = userData?.trialEndDate ? new Date(userData.trialEndDate) : null;
  const today = new Date();
  const daysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))) : 0;

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
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest text-center md:text-left">Valida tu clave institucional para acceso ilimitado.</p>
              </div>
            </div>
            <Button variant="outline" className="game-button border-orange-500 text-orange-600 font-black hover:bg-orange-500 hover:text-white" asChild>
              <Link href="/profile">Activar Ahora</Link>
            </Button>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2 p-10 rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-blue-600 text-white relative overflow-hidden glow-primary shadow-2xl">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <GraduationCap className="w-48 h-48 -rotate-12" />
            </div>
            <div className="relative z-10 space-y-6">
              <div>
                <h2 className="text-4xl font-black uppercase italic leading-none tracking-tighter">
                  ¡Hola, {userData?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Héroe'}!
                </h2>
                <p className="text-primary-foreground/80 mt-2 font-bold uppercase text-[10px] tracking-[0.3em]">Nivel {level} • Aspirante Académico</p>
              </div>
              <p className="text-lg opacity-90 font-medium max-w-sm">Has acumulado <strong>{points} puntos</strong>. ¡Sigue así para dominar el Saber 11!</p>
              <div className="flex gap-4">
                <Button className="game-button bg-white text-primary hover:bg-white/90 shadow-xl px-8 h-12" asChild>
                  <Link href="/practice">Ir a Entrenar</Link>
                </Button>
              </div>
            </div>
          </div>

          <StatCard icon={<Flame className="w-6 h-6 text-orange-500" />} label="Nivel Actual" value={level.toString()} color="bg-orange-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="Puntos Totales" value={points.toString()} color="bg-yellow-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                <Target className="text-primary w-6 h-6" />
                Misiones Disponibles
              </h3>
            </div>
            
            <div className="space-y-4">
              <MissionCard 
                title="Desafío Matemático" 
                subject="Matemáticas" 
                progress={points > 0 ? 40 : 0} 
                reward="+200 PTS" 
                icon={<Zap className="w-5 h-5" />}
                link="/practice/matematicas"
              />
              <MissionCard 
                title="Lectura Veloz" 
                subject="Lectura Crítica" 
                progress={points > 100 ? 20 : 0} 
                reward="+150 PTS" 
                icon={<BookOpen className="w-5 h-5" />}
                link="/practice/lectura"
              />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
              <Star className="text-accent w-6 h-6" />
              Tu Progreso
            </h3>
            <Card className="game-card border-accent/20 shadow-xl">
              <CardContent className="p-8 space-y-8 text-center">
                <div className="relative w-40 h-40 mx-auto">
                  <div className="absolute inset-0 rounded-full border-[10px] border-muted" />
                  <div className="absolute inset-0 rounded-full border-[10px] border-accent border-t-transparent" style={{ transform: `rotate(${xpProgress * 3.6}deg)` }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-5xl font-black text-foreground italic">{level}</span>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Nivel</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <Progress value={xpProgress} className="h-3 rounded-full bg-muted" />
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">{500 - (points % 500)} Puntos para el siguiente nivel</p>
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
    <Card className="game-card border-primary/10 hover:border-primary/40 shadow-sm transition-all">
      <CardContent className="p-8 flex items-center gap-5">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-black tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MissionCard({ title, subject, progress, reward, icon, link }: { title: string; subject: string; progress: number; reward: string; icon: React.ReactNode, link: string }) {
  return (
    <Link href={link} className="block game-card bg-card p-6 border-muted group cursor-pointer hover:border-primary/40 hover:shadow-lg transition-all">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
            {icon}
          </div>
          <div>
            <h4 className="font-black text-xl leading-none uppercase tracking-tight">{title}</h4>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{subject}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-black text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">{reward}</span>
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
