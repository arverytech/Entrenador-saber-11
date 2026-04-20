
"use client";

import { useState, useEffect } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, LogOut, CheckCircle2, Loader2, Sparkles, Ticket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [premiumKey, setPremiumKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const { user, firestore, auth, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData, isLoading: isDataLoading } = useDoc(userDocRef);

  const handleActivatePremium = async () => {
    if (!premiumKey || !firestore || !user || !userDocRef) return;

    setIsActivating(true);
    const inputKey = premiumKey.trim().toUpperCase();

    try {
      const isLegacyAdmin = inputKey === 'ADMIN-MASTER-2025';
      let keyData = null;
      let keyId = null;

      if (!isLegacyAdmin) {
        const keysRef = collection(firestore, 'premiumAccessKeys');
        // Single-field query to avoid requiring a composite Firestore index.
        // We filter isActive in memory after fetching.
        const q = query(keysRef, where('keyString', '==', inputKey), limit(5));
        const querySnapshot = await getDocs(q);

        const activeDoc = querySnapshot.docs.find(d => d.data().isActive === true);

        if (!activeDoc) {
          toast({ variant: "destructive", title: "Llave Inválida", description: "Código inexistente o ya usado." });
          setIsActivating(false);
          return;
        }

        keyData = activeDoc.data();
        keyId = activeDoc.id;
      }

      const userUpdates: any = { isTrial: false, updatedAt: serverTimestamp() };
      const isForAdmin = isLegacyAdmin || (keyData && keyData.type === 'admin_access');

      if (isForAdmin) {
        userUpdates.role = 'admin';
        await setDoc(doc(firestore, 'adminUsers', user.uid), {
          id: user.uid,
          email: user.email,
          activatedAt: serverTimestamp(),
          keyUsed: inputKey
        });
      }

      await updateDoc(userDocRef, userUpdates);

      if (keyId) {
        await updateDoc(doc(firestore, 'premiumAccessKeys', keyId), {
          isActive: false,
          redeemedByUserId: user.uid,
          redeemedAt: serverTimestamp()
        });
      }

      toast({ title: "¡Acceso Activado!", description: `Rango de ${isForAdmin ? 'Comandante' : 'Héroe Premium'} desbloqueado.` });
      setPremiumKey("");
      setTimeout(() => window.location.reload(), 1500);

    } catch (e: any) {
      console.error('handleActivatePremium error:', e);
      toast({ variant: "destructive", title: "Error al activar", description: e?.message || "No se pudo validar el código." });
    } finally {
      setIsActivating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
    } finally {
      router.push('/auth/login');
    }
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

  const isActuallyActivated = userData?.isTrial === false;

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row items-center gap-6 p-8 bg-card rounded-3xl border-2 shadow-lg">
          <Avatar className="w-24 h-24 border-4 border-primary">
            <AvatarImage src={user?.photoURL || ""} />
            <AvatarFallback className="bg-primary text-white text-3xl font-black">
              {userData?.displayName?.[0] || user?.email?.[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-black uppercase tracking-tight">{userData?.displayName || 'Héroe'}</h1>
            <p className="text-muted-foreground font-bold text-sm italic">{user?.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {!isActuallyActivated ? (
                <Badge className="bg-orange-500 text-white px-4 py-1">ASPIRANTE ({trialDaysLeft}D)</Badge>
              ) : (
                <Badge className="bg-secondary text-white px-4 py-1">HÉROE PREMIUM</Badge>
              )}
              {userData?.role === 'admin' && (
                <Badge className="bg-primary text-white px-4 py-1">COMANDANTE</Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-bold uppercase text-xs">
            <LogOut className="w-4 h-4 mr-2" /> Salir
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="game-card bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Estadísticas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">XP Acumulada</span>
                <span className="font-black text-primary text-lg">{userData?.currentPoints ?? 0}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Nivel Poder</span>
                <span className="font-black text-secondary text-lg">{Math.floor((userData?.currentPoints ?? 0) / 500) + 1}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={`game-card ${!isActuallyActivated ? 'border-accent/40 bg-accent/5' : 'bg-card'}`}>
            <CardHeader>
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-accent">
                <Ticket className="w-5 h-5" /> Centro de Licencias
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Canjea tu acceso institucional</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isActuallyActivated || userData?.role !== 'admin' ? (
                <div className="space-y-4">
                   <p className="text-xs italic text-muted-foreground leading-relaxed">
                     Ingresa el código que te entregó tu academia para activar el modo Premium.
                   </p>
                   <div className="flex flex-col gap-3">
                      <Input 
                        placeholder="CÓDIGO AQUÍ..." 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value)}
                        className="rounded-xl border-2 h-12 font-black uppercase text-center"
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
                <div className="flex flex-col items-center p-8 text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-secondary" />
                  <p className="font-black text-secondary text-xl uppercase italic">¡Acceso Verificado!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
