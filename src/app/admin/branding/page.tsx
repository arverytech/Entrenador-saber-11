"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Upload, RefreshCcw, Eye } from 'lucide-react';
import Image from 'next/image';

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
    setLogo("https://picsum.photos/seed/nicolas-logo/200/200");
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <Settings className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Personalización Institucional</h1>
            <p className="text-muted-foreground italic text-sm">Configura el nombre y el logo de tu institución.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className="md:col-span-2 game-card border-primary/10">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase">Datos de la Institución</CardTitle>
              <CardDescription>Esta información aparecerá en todas las pantallas de los estudiantes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="inst-name" className="font-bold uppercase text-xs tracking-widest">Nombre de la Institución</Label>
                <Input 
                  id="inst-name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. IED Nicolas Buenaventura"
                  className="rounded-xl border-2 focus:ring-primary h-12 text-lg font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inst-logo" className="font-bold uppercase text-xs tracking-widest">URL del Logo (O sube uno)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="inst-logo" 
                    value={logo} 
                    onChange={(e) => setLogo(e.target.value)}
                    placeholder="https://..."
                    className="rounded-xl border-2 focus:ring-primary"
                  />
                  <Button variant="outline" className="game-button px-4 border-2">
                    <Upload className="w-4 h-4 mr-2" />
                    Subir
                  </Button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button className="flex-1 game-button bg-primary h-12" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cambios
                </Button>
                <Button variant="ghost" className="game-button h-12" onClick={handleReset}>
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  Restablecer
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <h3 className="text-lg font-bold uppercase tracking-wider flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Ventana de Vista Previa
            </h3>
            <Card className="game-card overflow-hidden border-primary shadow-lg scale-105">
              <div className="bg-muted p-8 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative w-32 h-32 rounded-2xl overflow-hidden border-4 border-white shadow-xl glow-primary bg-white">
                  {logo ? (
                    <Image 
                      src={logo} 
                      alt="Preview" 
                      fill 
                      className="object-contain p-2"
                      data-ai-hint="institution logo preview"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-bold uppercase p-4">Sin Logo</div>
                  )}
                </div>
                <div>
                  <h4 className="font-black text-xl uppercase leading-tight text-primary">{name || "Nombre de Institución"}</h4>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Entrenador Saber 11</p>
                </div>
              </div>
              <CardContent className="p-4 bg-background border-t-2 border-primary/10">
                <p className="text-[10px] text-center text-muted-foreground italic font-bold">ASÍ ES COMO SE VERÁ EN LA PLATAFORMA</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}