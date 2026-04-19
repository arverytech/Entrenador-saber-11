
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, LogOut, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [premiumKey, setPremiumKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const { user, firestore, auth } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isDataLoading } = useDoc(userDocRef);

  const handleActivatePremium = async () => {
    if (!premiumKey || !firestore || !user || !userDocRef) return;

    setIsActivating(true);
    const key = premiumKey.trim().toUpperCase();
    const isAdminKey = key === 'ADMIN-MASTER-2025';
    const isPremiumKey = key === 'ICFES-PRO-2025';

    if (!isAdminKey && !isPremiumKey) {
      toast({ variant: "destructive", title: "Clave Inválida", description: "El código ingresado no es correcto." });
      setIsActivating(false);
      return;
    }

    try {
      const updates: any = { 
        isTrial: false, 
        updatedAt: serverTimestamp() 
      };

      if (isAdminKey) {
        updates.role = 'admin';
        await setDoc(doc(firestore, 'adminUsers', user.uid), {
          id: user.uid,
          email: user.email,
          activatedAt: serverTimestamp()
        });
      }

      await updateDoc(userDocRef, updates);
      
      toast({ 
        title: "¡Activación Exitosa!", 
        description: `Has desbloqueado el rango de ${isAdminKey ? 'Administrador Maestro' : 'Héroe Premium'}.` 
      });
      setPremiumKey("");
    } catch (e) {
      toast({ variant: "destructive", title: "Error de Servidor", description: "No se pudo procesar la activación." });
    } finally {
      setIsActivating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth/login');
  };

  const trialDaysLeft = userData?.trialEndDate 
    ? Math.max(0, Math.ceil((new Date(userData.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (isDataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // AUDITORÍA: Solo mostramos "Activado" si isTrial es explícitamente false
  const isActuallyActivated = userData?.isTrial === false;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-8 bg-card rounded-3xl border-2 border-primary/10 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <ShieldCheck className="w-32 h-32" />
          </div>
          <Avatar className="w-24 h-24 border-4 border-primary shadow-xl">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback className="bg-primary text-white text-3xl font-black uppercase">
              {userData?.displayName?.[0] || user?.email?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left z-10">
            <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">{userData?.displayName || 'Héroe'}</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">{user?.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {!isActuallyActivated ? (
                <Badge className="bg-orange-500 text-white font-bold border-none">RANGO: ASPIRANTE ({trialDaysLeft}D)</Badge>
              ) : (
                <Badge className="bg-secondary text-white font-bold border-none">RANGO: HÉROE PREMIUM</Badge>
              )}
              {userData?.role === 'admin' && (
                <Badge className="bg-primary text-white font-bold border-none">COMANDANTE ACADEMIA</Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-black uppercase text-xs hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Estadísticas Base
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Puntos de Experiencia</span>
                <span className="font-black text-primary text-lg">{userData?.currentPoints ?? 0} XP</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Nivel Actual</span>
                <span className="font-black text-secondary text-lg">{Math.floor((userData?.currentPoints ?? 0) / 500) + 1}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={`game-card border-2 ${!isActuallyActivated ? 'border-accent/40 bg-accent/5' : 'border-secondary/20 bg-card'}`}>
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Key className="w-5 h-5" /> Centro de Validación
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase">Activa tu código de comandante o estudiante</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isActuallyActivated ? (
                <div className="space-y-4">
                   <p className="text-xs italic text-muted-foreground leading-relaxed">
                     Ingresa el código proporcionado por tu institución o la llave maestra de administración.
                   </p>
                   <div className="flex flex-col gap-3">
                      <Input 
                        placeholder="Escribe tu código aquí..." 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value.toUpperCase())}
                        className="rounded-xl border-2 h-12 font-black uppercase tracking-widest text-center"
                      />
                      <Button 
                        className="game-button bg-accent text-white h-12 shadow-lg glow-accent" 
                        onClick={handleActivatePremium}
                        disabled={isActivating || !premiumKey}
                      >
                        {isActivating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Validar Acceso
                      </Button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center p-8 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center border-2 border-secondary">
                    <CheckCircle2 className="w-10 h-10 text-secondary" />
                  </div>
                  <div>
                    <p className="font-black text-secondary text-xl uppercase italic">¡Acceso Total!</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Tu cuenta ha sido verificada con éxito.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
