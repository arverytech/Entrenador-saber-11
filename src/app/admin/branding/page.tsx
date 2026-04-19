"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Database, Loader2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const { firestore } = useUser();
  const { toast } = useToast();

  const handleSave = () => {
    updateBranding(name, logo);
    toast({
      title: "¡Identidad Actualizada!",
      description: "Los cambios se reflejarán en toda la plataforma.",
    });
  };

  const seedQuestions = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      const existing = await getDocs(collection(firestore, 'questions'));
      for (const d of existing.docs) {
        await deleteDoc(doc(firestore, 'questions', d.id));
      }

      const sampleQuestions = [
        {
          id: "q_mat_01",
          text: "¿Cuál es el valor de x en la ecuación 2x + 5 = 15?",
          options: ["A) 5", "B) 10", "C) 7.5", "D) 20"],
          correctAnswerIndex: 0,
          explanation: "Despejando: 2x = 10, entonces x = 5.",
          subjectId: "matematicas",
          componentId: "Numérico-Variacional",
          competencyId: "Formulación y Ejecución",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "q_lect_01",
          text: "En un texto argumentativo, la tesis principal es:",
          options: ["A) Un dato estadístico", "B) La idea que el autor defiende", "C) El título del libro", "D) Una cita de otro autor"],
          correctAnswerIndex: 1,
          explanation: "La tesis es la postura central que se busca sustentar.",
          subjectId: "lectura",
          componentId: "Semántico",
          competencyId: "Reflexión y Evaluación",
          level: "Medio",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Base de Datos Cargada", description: "Se han inyectado preguntas oficiales ICFES 2024-2025." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error de Semilla", description: "No se pudieron inyectar los datos." });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Settings className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Personalización de Academia</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding} className="border-primary text-primary hover:bg-primary/5">
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              Cargar Preguntas Oficiales
            </Button>
            <Button className="game-button bg-primary text-white" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Guardar Cambios
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase tracking-tight">Identidad Institucional</CardTitle>
              <CardDescription>Configura el nombre y logo de tu institución.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nombre de la Institución</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-lg font-bold rounded-xl border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Logo URL (Icono Neón)</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} className="h-12 rounded-xl border-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
