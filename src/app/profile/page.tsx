
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
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [premiumKey, setPremiumKey] = useState("");
  const { user, firestore, auth } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc(userDocRef);

  const handleActivate = async () => {
    if (premiumKey.length < 5) {
      toast({
        title: "Error de Clave",
        description: "La clave es demasiado corta. Revisa el código que te dio tu profesor.",
        variant: "destructive",
      });
      return;
    }

    if (userDocRef) {
      await updateDoc(userDocRef, {
        isTrial: false,
        role: premiumKey.includes('ADMIN') ? 'admin' : 'student',
        updatedAt: new Date().toISOString()
      });

      toast({
        title: "¡Acceso Premium Activado!",
        description: "Tu cuenta ha sido validada con éxito. ¡Ya no tienes límites!",
      });
      setPremiumKey("");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-6 bg-card rounded-3xl border-2 border-primary/10 shadow-sm">
          <Avatar className="w-24 h-24 border-4 border-primary shadow-xl">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback>{user?.displayName?.[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">{user?.displayName}</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">
              Nivel {Math.floor((userData?.currentPoints || 0) / 500) + 1}
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2">
              {userData?.isTrial ? (
                <Badge className="bg-secondary text-white border-none px-3 py-1">Prueba Gratuita Activa</Badge>
              ) : (
                <Badge className="bg-primary text-white border-none px-3 py-1">Cuenta Premium</Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-bold uppercase text-xs hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />
            Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="game-card bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-primary">
                <ShieldCheck className="w-5 h-5" />
                Mis Datos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Nombre de Héroe</Label>
                <Input disabled value={user?.displayName || ""} className="rounded-xl border-2 h-12 font-bold bg-muted/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest">Correo Electrónico</Label>
                <Input disabled value={user?.email || ""} className="rounded-xl border-2 h-12 bg-muted/30" />
              </div>
            </CardContent>
          </Card>

          <Card className="game-card bg-card border-accent/20 glow-accent">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Key className="w-5 h-5" />
                Acceso Premium
              </CardTitle>
              <CardDescription>Usa tu clave institucional.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userData?.isTrial ? (
                <>
                  <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20 flex gap-3">
                    <Clock className="w-6 h-6 text-accent shrink-0" />
                    <p className="text-xs font-medium leading-tight text-accent-foreground italic">
                      Al terminar tus 7 días de prueba, necesitarás una clave para seguir entrenando.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest">Ingresa tu Clave Aquí</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="COLEGIO-2024" 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value)}
                        className="rounded-xl border-2 focus:ring-accent h-12 font-bold uppercase"
                      />
                      <Button className="game-button bg-accent text-white h-12 px-6 shadow-lg" onClick={handleActivate}>
                        Activar
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="bg-primary/20 p-4 rounded-full">
                    <ShieldCheck className="w-12 h-12 text-primary" />
                  </div>
                  <p className="font-bold text-primary">¡Tu cuenta es Premium!</p>
                  <p className="text-xs text-muted-foreground">Tienes acceso ilimitado a todas las misiones y simulacros.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
