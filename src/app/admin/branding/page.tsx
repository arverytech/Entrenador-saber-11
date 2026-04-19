"use client";

import { useState } from 'react';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Upload, RefreshCcw, Database, Loader2 } from 'lucide-react';
import { useUser } from '@/firebase';
import { collection, addDoc, serverTimestamp, getDocs, deleteDoc, doc } from 'firebase/firestore';

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
      title: "¡Configuración Guardada!",
      description: "La identidad institucional ha sido actualizada correctamente.",
    });
  };

  const seedQuestions = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      // Limpiar preguntas anteriores para evitar duplicados
      const existing = await getDocs(collection(firestore, 'questions'));
      for (const d of existing.docs) {
        await deleteDoc(doc(firestore, 'questions', d.id));
      }

      const sampleQuestions = [
        {
          title: "Si un autor utiliza la palabra 'paradójicamente' para introducir una idea, su intención principal es:",
          options: ["A) Confirmar una obviedad", "B) Señalar una contradicción aparente", "C) Describir un paisaje", "D) Citar a un experto"],
          correctIndex: 1,
          subjectId: "lectura",
          component: "Semántico",
          competency: "Reflexión sobre el contenido",
          level: "Medio",
          pointsAwarded: 50,
          createdAt: new Date().toISOString()
        },
        {
          title: "En una secuencia aritmética, el primer término es 5 y la diferencia común es 3. ¿Cuál es el valor del término número 12?",
          options: ["A) 35", "B) 38", "C) 41", "D) 44"],
          correctIndex: 1,
          subjectId: "matematicas",
          component: "Numérico - Variacional",
          competency: "Formulación y Ejecución",
          level: "Medio",
          pointsAwarded: 50,
          createdAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Base de Datos Cargada", description: "Se han inyectado preguntas oficiales con éxito." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error de Carga", description: "No se pudieron inyectar los datos." });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GameNavbar />
      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Settings className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-black uppercase">Personalización de Academia</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding}>
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              Cargar Preguntas Oficiales
            </Button>
            <Button className="game-button bg-primary" onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Guardar Identidad
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <Card className="game-card">
            <CardHeader>
              <CardTitle>Identidad Visual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Nombre de tu Institución</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-lg font-bold" />
              </div>
              <div className="space-y-2">
                <Label>Logo Institucional (URL)</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
