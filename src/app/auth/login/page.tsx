
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Trophy, LogIn, Sparkles } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de ingreso",
        description: "Credenciales incorrectas o usuario no encontrado.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error con Google",
        description: "No se pudo iniciar sesión con Google.",
      });
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
            <CardDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-center">
              Tu entrenamiento al éxito comienza aquí
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button 
            variant="outline" 
            onClick={handleGoogleLogin}
            className="w-full game-button border-2 h-12 font-bold flex items-center justify-center gap-3 hover:bg-muted transition-all"
          >
            <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/smartlock/google.svg" alt="Google" width={20} height={20} />
            Ingresar con mi cuenta Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase font-bold">
              <span className="bg-card px-2 text-muted-foreground tracking-widest">O usa tu correo registrado</span>
            </div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold uppercase text-xs tracking-widest">Correo Electrónico</Label>
              <Input 
                id="email" 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="estudiante@ejemplo.com" 
                className="rounded-xl border-2 h-12" 
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold uppercase text-xs tracking-widest">Contraseña</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border-2 h-12" 
                required
              />
            </div>
            <Button 
              type="submit"
              disabled={isLoading}
              className="w-full game-button bg-primary text-white h-12 text-lg shadow-lg glow-primary"
            >
              {isLoading ? "Cargando..." : "Iniciar Sesión"}
              <LogIn className="ml-2 w-5 h-5" />
            </Button>
          </form>

          <div className="text-center">
            <p className="text-sm text-muted-foreground font-medium">
              ¿Eres nuevo recluta?{" "}
              <Link href="/auth/register" className="font-black text-primary hover:underline">¡Regístrate gratis!</Link>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="absolute bottom-8 left-0 w-full text-center">
        <div className="inline-flex items-center gap-2 bg-secondary/10 text-secondary px-6 py-2 rounded-full border-2 border-secondary/30 shadow-sm animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">¡7 días de entrenamiento gratuito habilitados!</span>
        </div>
      </div>
    </div>
  );
}
