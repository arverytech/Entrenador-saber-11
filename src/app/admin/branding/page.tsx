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
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const { firestore, user } = useUser();
  const { toast } = useToast();

  const handleSave = () => {
    updateBranding(name, logo);
    toast({ title: "Cambios guardados", description: "Identidad actualizada." });
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
          text: "¿Cuál es el valor de x en la ecuación 2x + 10 = 30?",
          options: ["A) 10", "B) 15", "C) 20", "D) 5"],
          correctAnswerIndex: 0,
          explanation: "2x = 20, por lo tanto x = 10.",
          subjectId: "matematicas",
          componentId: "Numérico-Variacional",
          competencyId: "Razonamiento",
          level: "Medio",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
           id: "q_lect_01",
           text: "El autor de un texto argumentativo busca principalmente:",
           options: ["A) Entretener", "B) Persuadir", "C) Narrar", "D) Describir"],
           correctAnswerIndex: 1,
           explanation: "La función apelativa es central en la argumentación.",
           subjectId: "lectura",
           componentId: "Semántico",
           competencyId: "Reflexión",
           level: "Básico",
           pointsAwarded: 50,
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Éxito", description: "Banco de preguntas cargado." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos." });
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
            <Settings className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-black uppercase italic">Administración</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding} className="border-primary text-primary">
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              Cargar Preguntas Oficiales
            </Button>
            <Button className="game-button bg-primary text-white" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" /> Guardar Cambios
            </Button>
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="game-card border-primary/20 bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-bold uppercase">Identidad Institucional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre del Colegio</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Logo URL</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} className="h-12 border-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
