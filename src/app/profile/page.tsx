"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, Clock, LogOut, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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

    const isAdminKey = premiumKey === 'ADMIN-MASTER-2025';
    const isPremiumKey = premiumKey === 'ICFES-PRO-2025';

    if (!isAdminKey && !isPremiumKey) {
      toast({ variant: "destructive", title: "Clave Inválida", description: "El código ingresado no es correcto." });
      return;
    }

    if (userDocRef && firestore && user) {
      try {
        const updates: any = { isTrial: false, updatedAt: serverTimestamp() };
        if (isAdminKey) {
          updates.role = 'admin';
          await setDoc(doc(firestore, 'adminUsers', user.uid), {
            id: user.uid,
            email: user.email,
            activatedAt: serverTimestamp()
          });
        }
        await updateDoc(userDocRef, updates);
        toast({ title: "¡Activación Exitosa!", description: `Eres ahora ${isAdminKey ? 'Administrador' : 'Miembro Premium'}.` });
        setPremiumKey("");
      } catch (e) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo activar la clave." });
      }
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
          <Avatar className="w-24 h-24 border-4 border-primary">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback className="bg-primary text-white text-3xl font-black uppercase">
              {userData?.displayName?.[0] || user?.email?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">{userData?.displayName || 'Cargando...'}</h1>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">XP: {userData?.currentPoints ?? 0}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {userData?.isTrial ? (
                <Badge className="bg-orange-500 text-white font-bold">PRUEBA: {trialDaysLeft} DÍAS</Badge>
              ) : (
                <Badge className="bg-secondary text-white font-bold">PREMIUM</Badge>
              )}
              {userData?.role === 'admin' && (
                <Badge className="bg-primary text-white font-bold">ADMINISTRADOR</Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-bold uppercase text-xs">
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Identidad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Email</Label>
                <div className="p-4 bg-muted/20 rounded-xl border italic text-sm">{user?.email}</div>
              </div>
            </CardContent>
          </Card>

          <Card className={`game-card border-2 ${userData?.isTrial ? 'border-accent/40' : 'border-secondary/20'}`}>
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Key className="w-5 h-5" /> Activación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {userData?.isTrial ? (
                <div className="space-y-4">
                   <p className="text-xs italic text-muted-foreground">Usa tu código institucional o llave maestra.</p>
                   <div className="flex gap-2">
                      <Input 
                        placeholder="ADMIN-MASTER-2025" 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value.toUpperCase())}
                        className="rounded-xl border-2 h-12 font-bold uppercase"
                      />
                      <Button className="game-button bg-accent text-white h-12" onClick={handleActivatePremium}>Validar</Button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center p-8 text-center space-y-2">
                  <CheckCircle2 className="w-12 h-12 text-secondary" />
                  <p className="font-bold text-secondary text-lg uppercase">¡Activado!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
