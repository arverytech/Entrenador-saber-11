
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GameNavbar } from '@/components/game-navbar';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Database, Loader2, BookOpen, ShieldCheck, Ticket, Plus, Trash2 } from 'lucide-react';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';

export default function AdminBrandingPage() {
  const { institutionName, institutionLogo, updateBranding } = useBranding();
  const [name, setName] = useState(institutionName);
  const [logo, setLogo] = useState(institutionLogo);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const { firestore, user, isUserLoading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  const keysQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'premiumAccessKeys'), orderBy('createdAt', 'desc'));
  }, [firestore]);

  const { data: existingKeys } = useCollection(keysQuery);

  const handleSave = () => {
    updateBranding(name, logo);
    toast({ title: "Protocolo Guardado", description: "La identidad institucional ha sido sincronizada." });
  };

  const generateNewKey = async (type: 'premium_subscription' | 'admin_access') => {
    if (!firestore) return;
    setIsGeneratingKeys(true);
    try {
      const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
      const prefix = type === 'admin_access' ? 'ADM' : 'ICFES';
      const keyString = `${prefix}-${randomPart}-${Date.now().toString().slice(-4)}`;

      await addDoc(collection(firestore, 'premiumAccessKeys'), {
        keyString,
        type,
        durationDays: 365,
        isActive: true,
        createdAt: serverTimestamp(),
        redeemedByUserId: null,
        redeemedAt: null
      });

      toast({ title: "Llave Generada", description: `Nueva licencia ${type} lista para usar.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo generar la llave." });
    } finally {
      setIsGeneratingKeys(false);
    }
  };

  const deleteKey = async (id: string) => {
    if (!firestore) return;
    try {
      await deleteDoc(doc(firestore, 'premiumAccessKeys', id));
      toast({ title: "Llave Eliminada", description: "El código ha sido revocado." });
    } catch (e) {
      toast({ variant: "destructive", title: "Acceso Denegado", description: "No tienes permisos para eliminar llaves." });
    }
  };

  const seedQuestions = async () => {
    if (!firestore) return;
    setIsSeeding(true);
    try {
      const sampleQuestions = [
        {
          id: `q_mat_${Date.now()}`,
          text: "¿Cuál es el valor de x en la ecuación 2x + 5 = 15?",
          options: ["x = 5", "x = 10", "x = 20", "x = 7.5"],
          correctAnswerIndex: 0,
          explanation: "2x = 15 - 5 => 2x = 10 => x = 5.",
          subjectId: "matematicas",
          componentId: "Numérico-Variacional",
          competencyId: "Formulación y ejecución",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: `q_lect_${Date.now()}`,
          text: "En un texto argumentativo, la tesis principal es:",
          options: ["Un resumen del libro", "La opinión que el autor busca defender", "Un listado de personajes", "La bibliografía utilizada"],
          correctAnswerIndex: 1,
          explanation: "La tesis es la idea central u opinión que se sustenta con argumentos.",
          subjectId: "lectura",
          componentId: "Semántico",
          competencyId: "Interpretativa",
          level: "Básico",
          pointsAwarded: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];

      for (const q of sampleQuestions) {
        await addDoc(collection(firestore, 'questions'), q);
      }

      toast({ title: "Sincronización Exitosa", description: "Preguntas inyectadas en la base de datos." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Fallo de Carga", description: "Error al inyectar datos." });
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
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Panel de Comando</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">Gestión de Identidad y Licencias</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={seedQuestions} disabled={isSeeding} className="border-accent text-accent font-black h-12 hover:bg-accent/5">
              {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
              CARGAR PREGUNTAS OFICIALES
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
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Nombre de la Academia</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 border-2" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">URL del Logo (PNG)</Label>
                <Input value={logo} onChange={(e) => setLogo(e.target.value)} className="h-12 border-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="game-card border-accent/20 bg-card shadow-xl">
             <CardHeader className="flex flex-row items-center justify-between">
               <CardTitle className="text-xl font-bold uppercase flex items-center gap-2 text-accent">
                 <Ticket className="w-5 h-5" /> Generador de Licencias
               </CardTitle>
               <div className="flex gap-2">
                  <Button size="sm" onClick={() => generateNewKey('premium_subscription')} disabled={isGeneratingKeys} className="bg-secondary text-white font-bold h-8">
                    + PREMIUM
                  </Button>
                  <Button size="sm" onClick={() => generateNewKey('admin_access')} disabled={isGeneratingKeys} className="bg-primary text-white font-bold h-8">
                    + ADMIN
                  </Button>
               </div>
             </CardHeader>
             <CardContent className="space-y-4 max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] font-black uppercase">Llave</TableHead>
                      <TableHead className="text-[9px] font-black uppercase">Tipo</TableHead>
                      <TableHead className="text-[9px] font-black uppercase">Estado</TableHead>
                      <TableHead className="text-[9px] font-black uppercase text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {existingKeys?.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-mono text-xs font-bold">{k.keyString}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[8px] font-black">
                            {k.type === 'admin_access' ? 'ADMIN' : 'PREMIUM'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[8px] font-black ${k.isActive ? 'bg-secondary' : 'bg-muted text-muted-foreground'}`}>
                            {k.isActive ? 'ACTIVA' : 'USADA'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)} className="h-8 w-8 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!existingKeys || existingKeys.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs italic">
                          No hay llaves generadas. Crea una para empezar.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
             </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
