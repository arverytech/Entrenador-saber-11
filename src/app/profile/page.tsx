
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ShieldCheck, Key, LogOut, CheckCircle2, Loader2, Sparkles, AlertTriangle, Ticket } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
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
    const inputKey = premiumKey.trim().toUpperCase();

    try {
      // 1. Buscamos la llave en la base de datos de llaves únicas
      const keysRef = collection(firestore, 'premiumAccessKeys');
      const q = query(keysRef, where('keyString', '==', inputKey), where('isActive', '==', true), limit(1));
      const querySnapshot = await getDocs(q);

      // CASO ESPECIAL: Llave Legacy para el primer Admin (solo si el sistema está vacío)
      const isLegacyAdmin = inputKey === 'ADMIN-MASTER-2025';

      if (querySnapshot.empty && !isLegacyAdmin) {
        toast({ 
          variant: "destructive", 
          title: "Llave Inválida", 
          description: "Esta llave no existe, ya fue usada o ha expirado." 
        });
        setIsActivating(false);
        return;
      }

      let keyData = null;
      let keyId = null;

      if (!querySnapshot.empty) {
        const keyDoc = querySnapshot.docs[0];
        keyData = keyDoc.data();
        keyId = keyDoc.id;
      }

      // 2. Definimos las actualizaciones del usuario
      const userUpdates: any = { 
        isTrial: false, 
        updatedAt: serverTimestamp() 
      };

      const isForAdmin = isLegacyAdmin || (keyData && keyData.type === 'admin_access');

      if (isForAdmin) {
        userUpdates.role = 'admin';
        // Registramos en la colección de control de admins
        await setDoc(doc(firestore, 'adminUsers', user.uid), {
          id: user.uid,
          email: user.email,
          activatedAt: serverTimestamp(),
          keyUsed: inputKey
        });
      }

      // 3. Aplicamos cambios al usuario
      await updateDoc(userDocRef, userUpdates);

      // 4. "Quemamos" la llave si era de la base de datos
      if (keyId) {
        await updateDoc(doc(firestore, 'premiumAccessKeys', keyId), {
          isActive: false,
          redeemedByUserId: user.uid,
          redeemedAt: serverTimestamp()
        });
      }

      toast({ 
        title: "¡Protocolo Activado!", 
        description: `Has desbloqueado el rango de ${isForAdmin ? 'Comandante' : 'Héroe Premium'}.` 
      });
      setPremiumKey("");
      
      setTimeout(() => window.location.reload(), 1500);

    } catch (e: any) {
      console.error(e);
      toast({ 
        variant: "destructive", 
        title: "Error de Sincronización", 
        description: "No se pudo validar la llave con el Cuartel General." 
      });
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="font-black uppercase tracking-widest text-[10px]">Leyendo Perfil Holográfico...</p>
      </div>
    );
  }

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
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest italic">{user?.email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {!isActuallyActivated ? (
                <Badge className="bg-orange-500 text-white font-bold border-none px-4 py-1">RANGO: ASPIRANTE ({trialDaysLeft}D)</Badge>
              ) : (
                <Badge className="bg-secondary text-white font-bold border-none px-4 py-1">RANGO: HÉROE PREMIUM</Badge>
              )}
              {userData?.role === 'admin' && (
                <Badge className="bg-primary text-white font-bold border-none px-4 py-1">COMANDANTE ACADEMIA</Badge>
              )}
            </div>
          </div>
          <Button onClick={handleLogout} variant="ghost" className="text-destructive font-black uppercase text-xs hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" /> Abandonar Misión
          </Button>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Estadísticas de Héroe
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Puntos de Experiencia</span>
                <span className="font-black text-primary text-lg">{userData?.currentPoints ?? 0} XP</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border">
                <span className="text-[10px] font-black uppercase text-muted-foreground">Nivel de Poder</span>
                <span className="font-black text-secondary text-lg">{Math.floor((userData?.currentPoints ?? 0) / 500) + 1}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={`game-card border-2 ${!isActuallyActivated ? 'border-accent/40 bg-accent/5' : 'border-secondary/20 bg-card'}`}>
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                <Ticket className="w-5 h-5" /> Centro de Licencias
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase">Canjea tu llave única de acceso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isActuallyActivated || userData?.role !== 'admin' ? (
                <div className="space-y-4">
                   <p className="text-xs italic text-muted-foreground leading-relaxed">
                     Ingresa tu código de licencia personal para activar el modo Premium o Administrador.
                   </p>
                   <div className="flex flex-col gap-3">
                      <Input 
                        placeholder="CÓDIGO DE LICENCIA..." 
                        value={premiumKey}
                        onChange={(e) => setPremiumKey(e.target.value.toUpperCase())}
                        className="rounded-xl border-2 h-12 font-black uppercase tracking-widest text-center focus:border-accent"
                      />
                      <Button 
                        className="game-button bg-accent text-white h-12 shadow-lg glow-accent" 
                        onClick={handleActivatePremium}
                        disabled={isActivating || !premiumKey}
                      >
                        {isActivating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Sincronizar Acceso
                      </Button>
                   </div>
                </div>
              ) : (
                <div className="flex flex-col items-center p-8 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center border-2 border-secondary shadow-lg">
                    <CheckCircle2 className="w-10 h-10 text-secondary" />
                  </div>
                  <div>
                    <p className="font-black text-secondary text-xl uppercase italic">¡Acceso Verificado!</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">Tu cuenta está vinculada a una licencia oficial.</p>
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
