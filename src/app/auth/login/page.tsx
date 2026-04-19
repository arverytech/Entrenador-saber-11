
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trophy, LogIn, KeySquare, Loader2 } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de ingreso",
        description: "Revisa tu correo y contraseña.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(firestore, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 7);

        await setDoc(userDocRef, {
          id: user.uid,
          email: user.email,
          displayName: user.displayName || 'Héroe',
          role: 'student',
          currentPoints: 0,
          isTrial: true,
          trialEndDate: trialEndDate.toISOString(),
          institutionId: 'default',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      router.push('/dashboard');
    } catch (error: any) {
      console.error("Error Google Auth:", error);
      toast({
        variant: "destructive",
        title: "Error con Google",
        description: "Asegúrate de haber autorizado este dominio en la consola de Firebase.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-md game-card border-primary/20 shadow-2xl z-10 bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-primary p-3 rounded-2xl w-fit glow-primary">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-black uppercase tracking-tight text-primary">¡Ingreso de Héroes!</CardTitle>
            <CardDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              Entrena para el éxito académico
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button 
            variant="outline" 
            disabled={isLoading}
            onClick={handleGoogleLogin}
            className="w-full game-button border-2 h-12 font-bold flex items-center justify-center gap-3 hover:bg-muted transition-all"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Ingresar con Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold">
              <span className="bg-card px-2 text-muted-foreground tracking-widest">O usa tu correo</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold uppercase text-xs tracking-widest">Correo Electrónico</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl border-2 h-12" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold uppercase text-xs tracking-widest">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl border-2 h-12" required />
            </div>
            <div className="text-right">
              <Link href="/auth/forgot-password" className="text-xs font-bold text-primary hover:underline flex items-center justify-end gap-1">
                <KeySquare className="w-3 h-3" /> ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <Button type="submit" disabled={isLoading} className="w-full game-button bg-primary text-white h-12 text-lg shadow-lg glow-primary">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <LogIn className="mr-2 w-5 h-5" />}
              {isLoading ? "Entrando..." : "Iniciar Sesión"}
            </Button>
          </form>

          <div className="text-center">
            <p className="text-sm text-muted-foreground font-medium">
              ¿Eres nuevo? <Link href="/auth/register" className="font-black text-primary hover:underline">¡Crea tu cuenta!</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
