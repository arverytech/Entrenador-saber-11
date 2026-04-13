
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Upload, RefreshCcw, Eye, Monitor, Smartphone, Layout, GraduationCap, BookOpen, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const { toast } = useToast();

  const handleSave = () => {
    updateBranding(name, logo);
    toast({
      title: "¡Configuración Guardada!",
      description: "La identidad institucional ha sido actualizada correctamente.",
    });
  };

  const handleReset = () => {
    setName("IED Nicolas Buenaventura");
    setLogo("https://picsum.photos/seed/school-shield/200/200");
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight">Personalización Institucional</h1>
              <p className="text-muted-foreground italic text-sm">Configura la identidad visual que verán tus estudiantes.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="game-button border-2" onClick={handleReset}>
              <RefreshCcw className="w-4 h-4 mr-2" />
              Restablecer
            </Button>
            <Button className="game-button bg-primary shadow-lg glow-primary" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Guardar Identidad
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Panel de Configuración */}
          <Card className="lg:col-span-5 game-card border-primary/20 shadow-sm bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                Datos Maestros
              </CardTitle>
              <CardDescription>Esta información personaliza cada rincón de la plataforma.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="inst-name" className="font-bold uppercase text-xs tracking-widest text-primary">Nombre de tu Institución</Label>
                <Input 
                  id="inst-name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Colegio San Jose"
                  className="rounded-xl border-2 focus:ring-primary h-12 text-lg font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inst-logo" className="font-bold uppercase text-xs tracking-widest text-primary">Logo Institucional (URL)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="inst-logo" 
                    value={logo} 
                    onChange={(e) => setLogo(e.target.value)}
                    placeholder="https://..."
                    className="rounded-xl border-2 focus:ring-primary"
                  />
                  <Button variant="outline" className="game-button px-4 border-2 shrink-0">
                    <Upload className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-dashed border-primary/30">
                <h4 className="text-xs font-black uppercase text-primary mb-2">Consejo Académico</h4>
                <p className="text-xs text-muted-foreground leading-relaxed italic">
                  Utiliza un escudo institucional claro. Esto refuerza el sentido de pertenencia de los estudiantes durante sus misiones de estudio.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Panel de Vista Previa Multi-Interfaz */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Ventana de Vista Previa
              </h3>
            </div>

            <Tabs defaultValue="navbar" className="w-full">
              <TabsList className="grid w-full grid-cols-3 game-card p-1 h-14 bg-muted/50 border-primary/10">
                <TabsTrigger value="navbar" className="font-bold uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white h-full transition-all">
                  <Layout className="w-4 h-4 mr-2" /> Barra Superior
                </TabsTrigger>
                <TabsTrigger value="dashboard" className="font-bold uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white h-full transition-all">
                  <Monitor className="w-4 h-4 mr-2" /> Dashboard
                </TabsTrigger>
                <TabsTrigger value="practice" className="font-bold uppercase text-[10px] tracking-[0.2em] data-[state=active]:bg-primary data-[state=active]:text-white h-full transition-all">
                  <BookOpen className="w-4 h-4 mr-2" /> Área Práctica
                </TabsTrigger>
              </TabsList>

              {/* Vista Navbar */}
              <TabsContent value="navbar" className="mt-6 animate-in fade-in zoom-in-95 duration-300">
                <Card className="game-card overflow-hidden bg-background p-0 border-primary/30 shadow-xl">
                  <div className="bg-background/80 backdrop-blur-md border-b-2 border-primary/20 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden border-2 border-primary glow-primary">
                        {logo ? <Image src={logo} alt="Logo" fill className="object-cover" /> : <div className="w-full h-full bg-muted" />}
                      </div>
                      <div className="hidden sm:block">
                        <h4 className="font-bold text-sm leading-tight text-primary uppercase">{name || "COLEGIO"}</h4>
                        <p className="text-[8px] font-bold text-secondary uppercase tracking-widest">Entrenador Saber 11</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                      <div className="w-8 h-8 rounded-full bg-primary/20" />
                    </div>
                  </div>
                  <div className="p-16 bg-muted/20 flex flex-col items-center justify-center text-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm border border-primary/10">
                      <Layout className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Navegación Institucional</p>
                      <p className="text-[10px] italic opacity-60">Así es como verán el logo los estudiantes al navegar entre misiones.</p>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Vista Dashboard */}
              <TabsContent value="dashboard" className="mt-6 animate-in fade-in zoom-in-95 duration-300">
                <Card className="game-card bg-gradient-to-br from-primary to-primary/80 text-white p-10 border-none glow-primary shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <GraduationCap className="w-32 h-32" />
                  </div>
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white p-1 shadow-2xl flex items-center justify-center overflow-hidden">
                        {logo ? <Image src={logo} alt="Logo" width={56} height={56} className="object-contain" /> : <div className="w-full h-full bg-muted" />}
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.3em] border-b-2 border-white/40 pb-1">{name}</span>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-4xl font-black uppercase italic leading-none tracking-tight">Tu Academia <br /> de Héroes</h2>
                      <p className="text-sm opacity-90 max-w-xs font-medium">¡Hoy es un gran día para dominar las Matemáticas, Nicolas!</p>
                    </div>
                    <Button variant="secondary" className="game-button bg-white text-primary hover:bg-white/90">Empezar Misión</Button>
                  </div>
                </Card>
              </TabsContent>

              {/* Vista Práctica */}
              <TabsContent value="practice" className="mt-6 animate-in fade-in zoom-in-95 duration-300">
                <Card className="game-card overflow-hidden shadow-xl border-primary/20">
                  <div className="bg-primary/5 p-6 border-b-2 border-primary/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white p-1 border border-primary/20">
                         {logo ? <Image src={logo} alt="Logo" width={32} height={32} className="object-contain" /> : <div className="w-full h-full bg-muted" />}
                      </div>
                      <span className="font-black text-[10px] uppercase tracking-[0.2em] text-primary">{name}</span>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-accent/20 text-accent text-[9px] font-black uppercase">Misión #03 Active</div>
                  </div>
                  <div className="p-8 bg-card space-y-6">
                    <div className="space-y-2">
                      <div className="w-20 h-2 bg-muted rounded-full" />
                      <h3 className="text-lg font-bold">¿Cuál de las siguientes es una propiedad del agua?</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 text-xs font-bold flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-primary text-white flex items-center justify-center">A</div>
                        Capacidad calorífica alta
                      </div>
                      <div className="p-4 rounded-xl border-2 border-muted text-xs font-bold flex items-center gap-3 opacity-50">
                        <div className="w-6 h-6 rounded bg-muted-foreground text-white flex items-center justify-center">B</div>
                        Baja tensión superficial
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}
