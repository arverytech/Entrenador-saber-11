
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Flame, Target, BookOpen, Star, ArrowRight, Zap, GraduationCap, AlertTriangle } from 'lucide-react';
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-bounce bg-primary p-4 rounded-full">
          <GraduationCap className="w-12 h-12 text-white" />
        </div>
      </div>
    );
  }

  const points = userData?.currentPoints || 0;
  const level = Math.floor(points / 500) + 1;
  const xpForNextLevel = 500 - (points % 500);
  const progressToNextLevel = (points % 500) / 5;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Trial Warning */}
        {userData?.isTrial && (
          <div className="bg-accent/10 border-2 border-accent/30 p-4 rounded-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="text-accent w-6 h-6" />
              <div>
                <p className="font-bold text-accent">Modo Prueba de 7 Días</p>
                <p className="text-xs text-muted-foreground font-medium">Tu acceso terminará pronto. Valida tu clave institucional en el perfil.</p>
              </div>
            </div>
            <Button variant="outline" className="game-button border-accent text-accent" asChild>
              <Link href="/profile">Validar Ahora</Link>
            </Button>
          </div>
        )}

        {/* Welcome & Global Stats */}
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-white relative overflow-hidden glow-primary">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <GraduationCap className="w-32 h-32" />
            </div>
            <div className="relative z-10 space-y-4">
              <h2 className="text-3xl font-black uppercase italic">¡Hola, {user?.displayName || 'Estudiante'}!</h2>
              <p className="text-primary-foreground/90 max-w-md">Tu entrenamiento personal ha comenzado. Tienes <strong>{points} puntos</strong> acumulados.</p>
              <div className="flex gap-4 pt-2">
                <Button className="game-button bg-white text-primary hover:bg-white/90" asChild>
                  <Link href="/practice">Continuar Misión</Link>
                </Button>
                <Button variant="outline" className="game-button border-white/40 text-white hover:bg-white/10">
                  Simulacro
                </Button>
              </div>
            </div>
          </div>

          <StatCard icon={<Flame className="w-6 h-6 text-orange-500" />} label="Nivel" value={level.toString()} color="bg-orange-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="Puntos" value={points.toString()} color="bg-yellow-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Missions Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
                <Target className="text-primary w-5 h-5" />
                Misiones Activas
              </h3>
            </div>
            
            <div className="space-y-4">
              <MissionCard 
                title="Fundamentos de Matemáticas" 
                subject="Matemáticas" 
                progress={points > 100 ? 100 : points} 
                reward="200 PTS" 
                icon={<Zap className="w-5 h-5" />}
              />
              <MissionCard 
                title="Comprensión Lectora" 
                subject="Lectura Crítica" 
                progress={0} 
                reward="150 PTS" 
                icon={<BookOpen className="w-5 h-5" />}
              />
            </div>
          </div>

          {/* Progress Summary Column */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
              <Star className="text-accent w-5 h-5" />
              Tu Rango
            </h3>
            <Card className="game-card border-accent/20">
              <CardContent className="p-6 space-y-6 text-center">
                <div className="relative w-32 h-32 mx-auto">
                  <div className="absolute inset-0 rounded-full border-8 border-muted" />
                  <div className="absolute inset-0 rounded-full border-8 border-accent border-t-transparent transition-all" style={{ transform: `rotate(${progressToNextLevel * 3.6}deg)` }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black">{level}</span>
                    <span className="text-[10px] font-bold uppercase opacity-60">Nivel</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-bold">Aspirante {level > 5 ? 'Experto' : 'Novato'}</p>
                  <Progress value={progressToNextLevel} className="h-2" />
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{xpForNextLevel} PTS para Nivel {level + 1}</p>
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
    <Card className="game-card border-primary/10 hover:border-primary/30">
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-black">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MissionCard({ title, subject, progress, reward, icon }: { title: string; subject: string; progress: number; reward: string; icon: React.ReactNode }) {
  return (
    <div className="game-card bg-card p-5 border-muted group cursor-pointer hover:border-primary/40">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center transition-colors">
            {icon}
          </div>
          <div>
            <h4 className="font-bold text-lg leading-none">{title}</h4>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{subject}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-black text-secondary">{reward}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Progress value={progress} className="h-1.5" />
        </div>
        <span className="text-xs font-bold tabular-nums">{progress}%</span>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary">
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
