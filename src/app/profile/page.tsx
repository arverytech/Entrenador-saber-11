
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, Clock, LogOut, Save, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function ProfilePage() {
  const [premiumKey, setPremiumKey] = useState("");
  const { toast } = useToast();

  const handleActivate = () => {
    if (premiumKey.length < 5) {
      toast({
        title: "Error de Clave",
        description: "La clave es demasiado corta. Revisa el código que te dio tu profesor.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "¡Acceso Premium Activado!",
      description: "Tu cuenta ha sido validada con éxito. ¡A por ese puntaje de 500!",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-6 bg-card rounded-3xl border-2 border-primary/10 shadow-sm">
          <Avatar className="w-24 h-24 border-4 border-primary shadow-xl">
            <AvatarImage src="https://picsum.photos/seed/user1/200/200" />
            <AvatarFallback>EH</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">Estudiante Héroe</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">Aspirante al Éxito • Nivel 12</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
              <Badge className="bg-secondary text-white border-none px-3 py-1">Prueba Gratuita Activa</Badge>
              <Badge variant="outline" className="border-accent text-accent font-bold">5 Días Restantes</Badge>
            </div>
          </div>
          <Button variant="ghost" className="text-destructive font-bold uppercase text-xs hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Datos Personales */}
          <Card className="game-card bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-primary">
                <ShieldCheck className="w-5 h-5" />
                Mi Cuenta
              </CardTitle>
              <CardDescription>Configura tu identidad en el ranking.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Tu Nombre de Héroe</Label>
                <Input defaultValue="Estudiante Héroe" className="rounded-xl border-2 h-12 font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Correo Institucional</Label>
                <Input disabled defaultValue="estudiante@academia.edu.co" className="rounded-xl border-2 h-12 bg-muted/30" />
              </div>
              <Button className="w-full game-button bg-primary text-white h-12 shadow-lg glow-primary">
                <Save className="w-4 h-4 mr-2" />
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>

          {/* Validación Premium */}
          <Card className="game-card bg-card border-accent/20 glow-accent">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Key className="w-5 h-5" />
                Validar Acceso Premium
              </CardTitle>
              <CardDescription>Usa tu clave institucional para acceso ilimitado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20 flex gap-3">
                <Clock className="w-6 h-6 text-accent shrink-0" />
                <p className="text-xs font-medium leading-tight text-accent-foreground italic">
                  <strong>Importante:</strong> Al terminar tus 7 días de prueba, necesitarás una clave para seguir entrenando y ver tus simulacros.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Ingresa tu Clave Aquí</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Ej. COLEGIO-2024-XP" 
                    value={premiumKey}
                    onChange={(e) => setPremiumKey(e.target.value)}
                    className="rounded-xl border-2 focus:ring-accent h-12 font-bold uppercase tracking-widest"
                  />
                  <Button className="game-button bg-accent text-white h-12 px-6 shadow-lg" onClick={handleActivate}>
                    Activar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border border-dashed border-muted-foreground/30 text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                <AlertCircle className="w-4 h-4 text-secondary shrink-0" />
                Si perdiste tu clave, pídela al administrador de tu colegio.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
