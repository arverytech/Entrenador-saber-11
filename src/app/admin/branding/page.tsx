
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Upload, RefreshCcw, Eye, Monitor, Smartphone, Layout, GraduationCap, BookOpen } from 'lucide-react';
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
    setLogo("https://picsum.photos/seed/school-logo/200/200");
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
              <p className="text-muted-foreground italic text-sm">Configura la identidad de tu colegio en la plataforma.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="game-button" onClick={handleReset}>
              <RefreshCcw className="w-4 h-4 mr-2" />
              Restablecer
            </Button>
            <Button className="game-button bg-primary" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Guardar Todo
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Panel de Configuración */}
          <Card className="lg:col-span-5 game-card border-primary/10 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase">Datos de la Institución</CardTitle>
              <CardDescription>Esta información personaliza la experiencia de tus estudiantes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="inst-name" className="font-bold uppercase text-xs tracking-widest">Nombre del Colegio / Institución</Label>
                <Input 
                  id="inst-name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. IED Nicolas Buenaventura"
                  className="rounded-xl border-2 focus:ring-primary h-12 text-lg font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inst-logo" className="font-bold uppercase text-xs tracking-widest">URL del Logo Institucional</Label>
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

              <div className="p-4 bg-muted/50 rounded-2xl border border-dashed border-primary/20">
                <h4 className="text-xs font-black uppercase text-primary mb-2">Consejo de Marca</h4>
                <p className="text-xs text-muted-foreground leading-relaxed italic">
                  Utiliza un logo en formato PNG con fondo transparente para que se vea mejor sobre el fondo de la plataforma.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Panel de Vista Previa Multi-Interfaz */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" />
                Previsualización de Interfaces
              </h3>
            </div>

            <Tabs defaultValue="navbar" className="w-full">
              <TabsList className="grid w-full grid-cols-3 game-card p-1 h-12">
                <TabsTrigger value="navbar" className="font-bold uppercase text-[10px] tracking-widest"><Layout className="w-3 h-3 mr-2" /> Navbar</TabsTrigger>
                <TabsTrigger value="dashboard" className="font-bold uppercase text-[10px] tracking-widest"><Monitor className="w-3 h-3 mr-2" /> Dashboard</TabsTrigger>
                <TabsTrigger value="practice" className="font-bold uppercase text-[10px] tracking-widest"><Smartphone className="w-3 h-3 mr-2" /> Práctica</TabsTrigger>
              </TabsList>

              {/* Vista Navbar */}
              <TabsContent value="navbar" className="mt-4 animate-in fade-in slide-in-from-bottom-2">
                <Card className="game-card overflow-hidden bg-background p-0 border-primary">
                  <div className="bg-background/80 backdrop-blur-md border-b-2 border-primary/20 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden border-2 border-primary">
                        {logo ? <Image src={logo} alt="Logo" fill className="object-cover" /> : <div className="w-full h-full bg-muted" />}
                      </div>
                      <div className="hidden sm:block">
                        <h4 className="font-bold text-sm leading-tight text-primary uppercase">{name || "COLEGIO"}</h4>
                        <p className="text-[8px] font-bold text-secondary uppercase">Entrenador Saber 11</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="w-8 h-8 rounded-full bg-muted" />
                    </div>
                  </div>
                  <div className="p-12 bg-muted/20 flex flex-col items-center justify-center text-center">
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-2">Vista previa de la barra de navegación superior</p>
                    <p className="text-[10px] italic opacity-60">Así es como verán el logo los estudiantes al navegar.</p>
                  </div>
                </Card>
              </TabsContent>

              {/* Vista Dashboard */}
              <TabsContent value="dashboard" className="mt-4 animate-in fade-in slide-in-from-bottom-2">
                <Card className="game-card bg-gradient-to-br from-primary to-primary/80 text-white p-8 border-none glow-primary">
                  <div className="flex items-start justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white p-1 shadow-lg">
                          {logo ? <Image src={logo} alt="Logo" width={48} height={48} className="object-contain" /> : <div className="w-full h-full bg-muted" />}
                        </div>
                        <span className="text-xs font-black uppercase tracking-[0.2em]">{name}</span>
                      </div>
                      <h2 className="text-3xl font-black uppercase italic leading-none">Bienvenido a tu <br /> Entrenamiento</h2>
                      <p className="text-sm opacity-90 max-w-xs">¡Hoy es un gran día para mejorar tu puntaje, Nicolas!</p>
                    </div>
                    <GraduationCap className="w-24 h-24 opacity-20" />
                  </div>
                </Card>
              </TabsContent>

              {/* Vista Práctica */}
              <TabsContent value="practice" className="mt-4 animate-in fade-in slide-in-from-bottom-2">
                <Card className="game-card overflow-hidden">
                  <div className="bg-primary/5 p-6 border-b-2 border-primary/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <BookOpen className="text-primary w-5 h-5" />
                      <span className="font-black text-xs uppercase tracking-widest">{name}</span>
                    </div>
                    <div className="text-[10px] font-bold text-primary uppercase">Misión #03</div>
                  </div>
                  <div className="p-8 bg-card">
                    <h3 className="text-lg font-bold mb-6">¿Cuál de las siguientes es una propiedad del agua?</h3>
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl border-2 border-primary/20 bg-primary/5 text-xs font-bold">A) Alta capacidad calorífica</div>
                      <div className="p-3 rounded-xl border-2 border-muted text-xs font-bold">B) Baja tensión superficial</div>
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
