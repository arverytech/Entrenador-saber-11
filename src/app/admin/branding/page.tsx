
"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Database, Loader2, BookOpen, ShieldCheck } from 'lucide-react';
import { useUser } from '@/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const { firestore } = useUser();
  const { toast } = useToast();

  const handleSave = () => {
    updateBranding(name, logo);
    toast({ title: "Protocolo Guardado", description: "La identidad institucional ha sido sincronizada." });
  };

  const seedQuestions = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      // Limpiamos banco anterior para evitar duplicados
      const existing = await getDocs(collection(firestore, 'questions'));
      for (const d of existing.docs) {
        await deleteDoc(doc(firestore, 'questions', d.id));
      }

      const sampleQuestions = [
        {
          id: "q_mat_01",
          text: "En un mapa de escala 1:100.000, la distancia entre dos ciudades es de 5 cm. ¿Cuál es la distancia real en kilómetros?",
          options: ["A) 5 km", "B) 50 km", "C) 0.5 km", "D) 500 km"],
          correctAnswerIndex: 0,
          explanation: "5 cm * 100.000 = 500.000 cm = 5.000 m = 5 km.",
          subjectId: "matematicas",
          componentId: "Geométrico-Métrico",
          competencyId: "Formulación y ejecución",
          level: "Medio",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "q_mat_02",
          text: "¿Cuál es el área de un triángulo cuya base mide 10 cm y su altura es de 8 cm?",
          options: ["A) 80 cm²", "B) 40 cm²", "C) 20 cm²", "D) 18 cm²"],
          correctAnswerIndex: 1,
          explanation: "(Base * Altura) / 2 = (10 * 8) / 2 = 40.",
          subjectId: "matematicas",
          componentId: "Geométrico-Métrico",
          competencyId: "Formulación y ejecución",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
           id: "q_lect_01",
           text: "Cuando un autor utiliza la ironía en un texto, su intención principal suele ser:",
           options: ["A) Confundir al lector", "B) Criticar de manera indirecta", "C) Definir conceptos técnicos", "D) Narrar hechos históricos"],
           correctAnswerIndex: 1,
           explanation: "La ironía es una figura retórica de crítica indirecta.",
           subjectId: "lectura",
           componentId: "Semántico",
           competencyId: "Reflexión",
           level: "Medio",
           pointsAwarded: 50,
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Sincronización Exitosa", description: "Banco de preguntas oficiales inyectado con éxito." });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Fallo de Carga", description: "Error al inyectar datos en Firestore." });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl border-2 border-primary/20">
              <Settings className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Personalizar Academia</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">Configuración de marca y contenido oficial</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding} className="border-accent text-accent font-black h-12 hover:bg-accent/5">
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              INYECTAR PREGUNTAS OFICIALES
            </Button>
            <Button className="game-button bg-primary text-white h-12 px-8" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> GUARDAR IDENTIDAD
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" /> Identidad Visual
              </CardTitle>
              <CardDescription className="text-[10px] uppercase font-bold">Afecta a todos los estudiantes de la institución</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre de la Academia / Colegio</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 border-2 focus:border-primary" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">URL del Logo (Escudo)</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} className="h-12 border-2 focus:border-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="game-card border-secondary/20 bg-card shadow-xl">
             <CardHeader>
               <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-secondary">
                 <ShieldCheck className="w-5 h-5" /> Estado del Servidor
               </CardTitle>
             </CardHeader>
             <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center gap-4">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center border-2 border-secondary animate-pulse-glow">
                  <ShieldCheck className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <p className="font-black text-secondary uppercase italic">Sistemas Operativos</p>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">Conexión con Firestore: ESTABLE</p>
                </div>
             </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
