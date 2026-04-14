
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, Clock, LogOut, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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

  const handleActivatePremium = async () => {
    if (!premiumKey) return;

    // Lógica de simulación de validación de claves
    // En producción, esto consultaría una colección de 'premiumAccessKeys'
    const isAdminKey = premiumKey.startsWith('ADMIN-');
    const isStudentKey = premiumKey === 'SABER11-PRO-2024' || premiumKey.length > 8;

    if (!isStudentKey && !isAdminKey) {
      toast({
        variant: "destructive",
        title: "Clave Inválida",
        description: "El código ingresado no es correcto. Solicítalo a tu profesor.",
      });
      return;
    }

    if (userDocRef) {
      await updateDoc(userDocRef, {
        isTrial: false,
        role: isAdminKey ? 'admin' : 'student',
        updatedAt: serverTimestamp()
      });

      toast({
        title: "¡Cuenta Actualizada!",
        description: `Has activado el acceso ${isAdminKey ? 'Administrador' : 'Premium'} con éxito.`,
      });
      setPremiumKey("");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth/login');
  };

  const trialDaysLeft = userData?.trialEndDate 
    ? Math.max(0, Math.ceil((new Date(userData.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-8 bg-card rounded-3xl border-2 border-primary/10 shadow-lg">
          <Avatar className="w-24 h-24 border-4 border-primary shadow-xl">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback className="bg-primary text-white text-3xl font-black">
              {user?.displayName?.[0] || user?.email?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">{user?.displayName || 'Estudiante'}</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">
              Puntos Acumulados: {userData?.currentPoints || 0} PTS
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {userData?.isTrial ? (
                <Badge className="bg-orange-500 text-white border-none px-4 py-1 font-bold">
                  MODO PRUEBA: {trialDaysLeft} DÍAS RESTANTES
                </Badge>
              ) : (
                <Badge className="bg-secondary text-white border-none px-4 py-1 font-bold">
                  ACCESO PREMIUM ACTIVADO
                </Badge>
              )}
              {userData?.role === 'admin' && (
                <Badge className="bg-primary text-white border-none px-4 py-1 font-bold">
                  RANGO: ADMINISTRADOR
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-bold uppercase text-xs hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Datos Personales */}
          <Card className="game-card bg-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-primary">
                <ShieldCheck className="w-5 h-5" />
                Información de Avatar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nombre de Héroe</Label>
                <div className="p-4 bg-muted/20 rounded-xl border-2 font-bold">{user?.displayName || 'Sin nombre'}</div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Correo Académico</Label>
                <div className="p-4 bg-muted/20 rounded-xl border-2 italic text-sm">{user?.email}</div>
              </div>
            </CardContent>
          </Card>

          {/* Activación de Clave */}
          <Card className={`game-card border-2 transition-all ${userData?.isTrial ? 'border-accent/40 glow-accent' : 'border-secondary/20 grayscale opacity-80'}`}>
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Key className="w-5 h-5" />
                Validación de Clave
              </CardTitle>
              <CardDescription className="font-bold text-xs uppercase">Extiende tu entrenamiento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {userData?.isTrial ? (
                <>
                  <div className="p-4 bg-accent/5 rounded-2xl border border-accent/20 flex gap-3">
                    <Clock className="w-6 h-6 text-accent shrink-0" />
                    <p className="text-xs font-medium leading-tight text-accent-foreground">
                      Tu prueba gratuita es limitada. Ingresa la clave que te entregó tu institución para obtener acceso ilimitado.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-xs font-black uppercase tracking-widest">Código de Activación</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="EJ: COLEGIO-ABC-123" 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value.toUpperCase())}
                        className="rounded-xl border-2 focus:ring-accent h-12 font-bold uppercase"
                      />
                      <Button className="game-button bg-accent text-white h-12 px-6 shadow-lg" onClick={handleActivatePremium}>
                        Validar
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="bg-secondary/20 p-4 rounded-full">
                    <ShieldCheck className="w-12 h-12 text-secondary" />
                  </div>
                  <p className="font-bold text-secondary text-lg uppercase">¡Héroe Validado!</p>
                  <p className="text-xs text-muted-foreground italic">Ya no necesitas claves. Tu entrenamiento es ilimitado y permanente.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Admin Tip */}
        {userData?.role !== 'admin' && (
          <div className="p-4 bg-muted/30 rounded-2xl flex items-center gap-3 border border-dashed border-muted-foreground/30">
            <ShieldAlert className="w-5 h-5 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              Si eres administrador, ingresa tu clave especial para habilitar el panel de gestión institucional.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
