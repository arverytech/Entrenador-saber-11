
"use client";

import { useMemo } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { Users, Trophy, Target, TrendingUp, ShieldCheck, GraduationCap, ArrowUpRight, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

export default function AdminGlobalDashboard() {
  const usersQuery = useMemoFirebase(() => query(collection(useMemoFirebase(() => require('@/firebase').initializeFirebase().firestore, [])!, 'users'), orderBy('currentPoints', 'desc'), limit(50)), []);
  const { data: students, isLoading } = useCollection(usersQuery);

  const totalXP = students?.reduce((acc, curr) => acc + (curr.currentPoints || 0), 0) || 0;
  const avgXP = students?.length ? Math.floor(totalXP / students.length) : 0;

  // Datos simulados para el gráfico de actividad (en una fase siguiente esto vendrá de una agregación real)
  const activityData = [
    { day: "Lun", intentos: 45 },
    { day: "Mar", intentos: 52 },
    { day: "Mie", intentos: 38 },
    { day: "Jue", intentos: 65 },
    { day: "Vie", intentos: 48 },
    { day: "Sab", intentos: 20 },
    { day: "Dom", intentos: 15 },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <GraduationCap className="w-12 h-12 text-primary animate-bounce" />
        <p className="font-black uppercase tracking-widest text-xs">Cargando Inteligencia Central...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-4 rounded-3xl border-2 border-primary/20">
              <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-black uppercase tracking-tighter italic">Cuartel General</h1>
              <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest italic">Visión estratégica del rendimiento institucional</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-card p-4 rounded-2xl border-2 shadow-sm">
            <TrendingUp className="w-5 h-5 text-secondary" />
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none">Crecimiento Semanal</p>
              <p className="text-lg font-black text-secondary">+12.5%</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<Users className="w-6 h-6 text-blue-500" />} label="Total Estudiantes" value={students?.length?.toString() || "0"} color="bg-blue-500/10" />
          <StatCard icon={<Trophy className="w-6 h-6 text-yellow-500" />} label="XP Institucional" value={totalXP.toLocaleString()} color="bg-yellow-500/10" />
          <StatCard icon={<Target className="w-6 h-6 text-red-500" />} label="XP Promedio" value={avgXP.toLocaleString()} color="bg-red-500/10" />
          <StatCard icon={<BarChart3 className="w-6 h-6 text-green-500" />} label="Nivel Académico" value="B+" color="bg-green-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 game-card bg-card border-primary/10 shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold uppercase tracking-tight">Actividad de Entrenamiento</CardTitle>
                <CardDescription>Intentos de preguntas en los últimos 7 días</CardDescription>
              </div>
              <BarChart3 className="w-5 h-5 text-muted-foreground opacity-50" />
            </CardHeader>
            <CardContent className="h-[300px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <Bar dataKey="intentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="game-card bg-card border-accent/20 shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                <Trophy className="w-5 h-5 text-accent" />
                Salón de la Fama
              </CardTitle>
              <CardDescription>Los 5 estudiantes con mayor puntaje</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {students?.slice(0, 5).map((student, i) => (
                <div key={student.id} className="flex items-center gap-4 group">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center font-black text-sm border-2 border-primary/20 group-hover:bg-primary group-hover:text-white transition-all">
                      {i + 1}
                    </div>
                    {i === 0 && <div className="absolute -top-2 -right-2 text-yellow-500"><Trophy className="w-4 h-4 fill-current" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate uppercase">{student.displayName}</p>
                    <Progress value={(student.currentPoints % 500) / 5} className="h-1.5 mt-1" />
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-primary">{student.currentPoints} XP</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="game-card border-muted shadow-2xl overflow-hidden">
          <CardHeader className="bg-muted/30 border-b">
            <CardTitle className="text-xl font-bold uppercase tracking-tight">Registro General de Aspirantes</CardTitle>
            <CardDescription>Gestión y seguimiento de progreso individual</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Estudiante</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Email</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Puntos (XP)</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Estado</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students?.map((student) => (
                <TableRow key={student.id} className="hover:bg-primary/5 transition-colors">
                  <TableCell className="font-bold uppercase text-xs">{student.displayName}</TableCell>
                  <TableCell className="text-xs italic text-muted-foreground">{student.email}</TableCell>
                  <TableCell className="font-black text-primary">{student.currentPoints}</TableCell>
                  <TableCell>
                    <Badge variant={student.isTrial ? "outline" : "default"} className={student.isTrial ? "border-orange-500 text-orange-600" : "bg-secondary"}>
                      {student.isTrial ? "Prueba" : "Premium"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors text-primary">
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <Card className="game-card border-primary/10 hover:border-primary/40 shadow-sm transition-all bg-card">
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">{label}</p>
          <p className="text-2xl font-black text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
