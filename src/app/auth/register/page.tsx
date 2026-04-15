
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Rocket, CheckCircle2, UserPlus } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth, firestore } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 7);

      // AUDITORÍA FORENSE: Aseguramos que el documento se cree antes de redirigir (await)
      // Forzamos 0 XP inicial para evitar el efecto demo
      await setDoc(doc(firestore, 'users', user.uid), {
        id: user.uid,
        email: user.email,
        displayName: name,
        role: 'student',
        currentPoints: 0, 
        isTrial: true,
        trialEndDate: trialEndDate.toISOString(),
        institutionId: 'default',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      toast({
        title: "¡Avatar Creado!",
        description: "Tu entrenamiento empieza ahora con 0 XP. ¡Demuestra tu poder!",
      });

      router.push('/dashboard');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al registrar",
        description: error.message || "No se pudo crear la cuenta.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-md game-card border-primary/20 shadow-2xl z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-secondary p-3 rounded-2xl w-fit glow-secondary">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-black uppercase tracking-tight">Crea tu Avatar</CardTitle>
            <CardDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              Tu camino al Saber 11 empieza aquí
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-bold uppercase text-xs tracking-widest">Tu Nombre de Héroe</Label>
              <Input 
                id="name" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Nicolas Buenaventura" 
                className="rounded-xl border-2 h-12" 
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold uppercase text-xs tracking-widest">Correo Institucional</Label>
              <Input 
                id="email" 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="estudiante@colegio.edu.co" 
                className="rounded-xl border-2 h-12" 
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold uppercase text-xs tracking-widest">Crea una Contraseña</Label>
              <Input 
                id="password" 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border-2 h-12" 
                required
              />
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-muted-foreground/10">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Al registrarte, recibes 7 días de acceso completo para dominar el examen.
                </p>
              </div>
            </div>

            <Button 
              type="submit"
              disabled={isLoading}
              className="w-full game-button bg-secondary h-12 text-lg shadow-lg glow-secondary"
            >
              {isLoading ? "Creando Avatar..." : "Iniciar Misión"}
              <Rocket className="ml-2 w-5 h-5" />
            </Button>
          </form>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/auth/login" className="font-bold text-primary hover:underline">Inicia Sesión</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
