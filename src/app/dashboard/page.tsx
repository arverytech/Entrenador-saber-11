
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Flame, Target, BookOpen, Star, ArrowRight, Zap, GraduationCap } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Welcome & Global Stats */}
        <div className="grid lg:grid-cols-4 gap-6">
          <div className="lg:col-span-2 p-8 rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-white relative overflow-hidden glow-primary">
            <div className="absolute top-0 right-0 p-4 opacity-20">
              <GraduationCap className="w-32 h-32" />
            </div>
            <div className="relative z-10 space-y-4">
              <h2 className="text-3xl font-black uppercase italic">¡Hola de nuevo, Nicolas!</h2>
              <p className="text-primary-foreground/90 max-w-md">Tu racha de estudio actual es de <strong>5 días</strong>. ¡Sigue así para desbloquear el Cofre de Fin de Semana!</p>
              <div className="flex gap-4 pt-2">
                <Button className="game-button bg-white text-primary hover:bg-white/90" asChild>
                  <Link href="/practice/recommended">Continuar Misión</Link>
                </Button>
                <Button variant="outline" className="game-button border-white/40 text-white hover:bg-white/10" asChild>
                  <Link href="/simulations">Simulacro</Link>
                </Button>
              </div>
            </div>
          </div>

          <StatCard icon={<Flame className="w-6 h-6 text-orange-500" />} label="Racha Diaria" value="5 Días" color="bg-orange-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="Puntos Totales" value="1,250" color="bg-yellow-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Missions Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
                <Target className="text-primary w-5 h-5" />
                Misiones de Aprendizaje (IA)
              </h3>
              <Button variant="ghost" className="text-xs font-bold uppercase text-primary">Ver Todas</Button>
            </div>
            
            <div className="space-y-4">
              <MissionCard 
                title="Dominio de Polinomios" 
                subject="Matemáticas" 
                progress={75} 
                reward="200 PTS" 
                icon={<Zap className="w-5 h-5" />}
              />
              <MissionCard 
                title="Inferencia Textual" 
                subject="Lectura Crítica" 
                progress={40} 
                reward="150 PTS" 
                icon={<BookOpen className="w-5 h-5" />}
              />
              <MissionCard 
                title="Célula y Energía" 
                subject="Naturales" 
                progress={10} 
                reward="300 PTS" 
                icon={<Star className="w-5 h-5" />}
              />
            </div>
          </div>

          {/* Progress Summary Column */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
              <Star className="text-accent w-5 h-5" />
              Nivel de Usuario
            </h3>
            <Card className="game-card border-accent/20">
              <CardContent className="p-6 space-y-6 text-center">
                <div className="relative w-32 h-32 mx-auto">
                  <div className="absolute inset-0 rounded-full border-8 border-muted" />
                  <div className="absolute inset-0 rounded-full border-8 border-accent border-t-transparent rotate-45" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black">12</span>
                    <span className="text-[10px] font-bold uppercase opacity-60">Nivel</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-bold">Estratega de Ciencias</p>
                  <Progress value={65} className="h-2" />
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">450 XP para Nivel 13</p>
                </div>
                <Button className="w-full game-button bg-accent hover:bg-accent/90 shadow-lg glow-accent">
                  Ver Logros
                </Button>
              </CardContent>
            </Card>

            <h3 className="text-xl font-bold uppercase tracking-wider pt-4">Rendimiento por Área</h3>
            <div className="space-y-3">
              <SubjectMiniStat label="Matemáticas" score={380} color="bg-blue-500" />
              <SubjectMiniStat label="Lectura Crítica" score={410} color="bg-green-500" />
              <SubjectMiniStat label="Ciencias Naturales" score={320} color="bg-yellow-500" />
              <SubjectMiniStat label="Ciencias Sociales" score={355} color="bg-red-500" />
              <SubjectMiniStat label="Inglés" score={440} color="bg-purple-500" />
            </div>
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
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
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

function SubjectMiniStat({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-xs font-bold uppercase">{label}</span>
      </div>
      <span className="text-xs font-black tabular-nums">{score}</span>
    </div>
  );
}
