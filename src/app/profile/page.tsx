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
        description: "La clave es demasiado corta. Revisa tu código institucional.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "¡Acceso Total Desbloqueado!",
      description: "Tu cuenta ahora es Premium. ¡A estudiar, héroe!",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-6 bg-card rounded-3xl border-2 border-primary/10 shadow-sm">
          <Avatar className="w-24 h-24 border-4 border-primary">
            <AvatarImage src="https://picsum.photos/seed/user1/200/200" />
            <AvatarFallback>NB</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">Nicolas Buenaventura</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">Estudiante • Nivel 12</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
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
          <Card className="game-card bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Mi Cuenta
              </CardTitle>
              <CardDescription>Configura tus datos de estudiante.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Nombre Completo</Label>
                <Input defaultValue="Nicolas Buenaventura" className="rounded-xl border-2 h-12" />
              </div>
              <Button className="w-full game-button bg-primary text-white h-12 shadow-lg">
                <Save className="w-4 h-4 mr-2" />
                Guardar
              </Button>
            </CardContent>
          </Card>

          <Card className="game-card bg-card border-accent/20 glow-accent">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <Key className="w-5 h-5 text-accent" />
                Validar Acceso
              </CardTitle>
              <CardDescription>Usa tu clave secreta institucional para seguir estudiando.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20 flex gap-3">
                <Clock className="w-6 h-6 text-accent shrink-0" />
                <p className="text-xs font-medium leading-tight text-accent-foreground italic">
                  Recuerda: Cuando pasen tus 7 días de prueba, el sistema te pedirá una clave para entrar.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Ingresa tu Clave Aquí</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Escribe tu clave..." 
                    value={premiumKey}
                    onChange={(e) => setPremiumKey(e.target.value)}
                    className="rounded-xl border-2 focus:ring-accent h-12 font-bold"
                  />
                  <Button className="game-button bg-accent text-white h-12 px-6" onClick={handleActivate}>
                    Validar
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-xl border border-dashed border-muted-foreground/30 text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                <AlertCircle className="w-4 h-4 text-secondary shrink-0" />
                Si no tienes clave, pídela al profesor de tu colegio.
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
