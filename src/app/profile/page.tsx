
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, Clock, LogOut, Save, BadgeCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

export default function ProfilePage() {
  const [premiumKey, setPremiumKey] = useState("");
  const { toast } = useToast();

  const handleActivate = () => {
    toast({
      title: "Validando Clave...",
      description: "Estamos verificando tu acceso premium.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex items-center gap-6 p-6 bg-card rounded-3xl border-2 border-primary/10 shadow-sm">
          <Avatar className="w-24 h-24 border-4 border-primary">
            <AvatarImage src="https://picsum.photos/seed/user1/200/200" />
            <AvatarFallback>NB</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-3xl font-black uppercase tracking-tight">Nicolas Buenaventura</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">Estudiante Elite • Nivel 12</p>
            <div className="flex gap-2 mt-2">
              <Badge className="bg-secondary text-white border-none">Prueba Gratuita</Badge>
              <Badge variant="outline" className="border-accent text-accent">5 días restantes</Badge>
            </div>
          </div>
          <Button variant="ghost" className="text-destructive font-bold uppercase text-xs">
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Configuración de Cuenta */}
          <Card className="game-card bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Datos del Perfil
              </CardTitle>
              <CardDescription>Actualiza tu identidad de estudiante.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Nombre de Usuario</Label>
                <Input defaultValue="Nicolas Buenaventura" className="rounded-xl border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Correo Institucional</Label>
                <Input defaultValue="nicolas@colegio.edu.co" disabled className="rounded-xl border-2 bg-muted/50" />
              </div>
              <Button className="w-full game-button bg-primary text-white shadow-lg">
                <Save className="w-4 h-4 mr-2" />
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>

          {/* Verificación de Acceso Premium */}
          <Card className="game-card bg-card border-accent/20 glow-accent">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <Key className="w-5 h-5 text-accent" />
                Acceso Premium
              </CardTitle>
              <CardDescription>Ingresa tu clave institucional para acceso ilimitado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20 flex gap-3">
                <Clock className="w-6 h-6 text-accent shrink-0" />
                <div>
                  <p className="text-xs font-bold text-accent uppercase">Estado de la Suscripción</p>
                  <p className="text-sm font-medium">Tu periodo de prueba de 7 días expira en <strong>48 horas</strong>.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Clave de Activación</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="XXXX-XXXX-XXXX" 
                    value={premiumKey}
                    onChange={(e) => setPremiumKey(e.target.value)}
                    className="rounded-xl border-2 focus:ring-accent"
                  />
                  <Button className="game-button bg-accent text-white" onClick={handleActivate}>
                    Validar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                <BadgeCheck className="w-4 h-4 text-secondary" />
                El acceso premium desbloquea todos los simulacros y la ruta de IA.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
