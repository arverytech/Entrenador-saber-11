
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Rocket, CheckCircle2, UserPlus } from 'lucide-react';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
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
              Únete a la legión de estudiantes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-bold uppercase text-xs tracking-widest">Nombre Completo</Label>
              <Input id="name" placeholder="Nicolas Buenaventura" className="rounded-xl border-2 h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold uppercase text-xs tracking-widest">Correo Institucional</Label>
              <Input id="email" type="email" placeholder="estudiante@colegio.edu.co" className="rounded-xl border-2 h-12" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold uppercase text-xs tracking-widest">Crea una Contraseña</Label>
              <Input id="password" type="password" className="rounded-xl border-2 h-12" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-xl border border-muted-foreground/10">
              <CheckCircle2 className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-tight">Al registrarte, aceptas nuestros términos de servicio y política de privacidad del entrenamiento.</p>
            </div>
          </div>

          <Button className="w-full game-button bg-secondary h-12 text-lg shadow-lg glow-secondary" asChild>
            <Link href="/dashboard">
              Empezar Entrenamiento
              <Rocket className="ml-2 w-5 h-5" />
            </Link>
          </Button>

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
