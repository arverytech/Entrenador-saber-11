
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Key, ArrowLeft, Mail } from 'lucide-react';
import { useFirebase } from '@/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth } = useFirebase();
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: "Correo Enviado",
        description: "Revisa tu bandeja de entrada para restablecer tu contraseña.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No pudimos encontrar una cuenta con ese correo.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-md game-card border-primary/20 shadow-2xl z-10 bg-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-primary p-3 rounded-2xl w-fit glow-primary">
            <Key className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-3xl font-black uppercase tracking-tight text-primary">Recuperar Acceso</CardTitle>
            <CardDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              Te enviaremos un enlace de restauración
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold uppercase text-xs tracking-widest">Correo de tu Avatar</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="tu@correo.com"
                className="rounded-xl border-2 h-12" 
                required 
              />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full game-button bg-primary text-white h-12 text-lg shadow-lg glow-primary">
              {isLoading ? "Enviando..." : "Enviar Enlace"}
              <Mail className="ml-2 w-5 h-5" />
            </Button>
          </form>

          <div className="text-center">
            <Link href="/auth/login" className="text-sm font-bold text-muted-foreground hover:text-primary flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Volver al Ingreso
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
