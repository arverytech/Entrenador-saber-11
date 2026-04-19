
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Trophy, Home, BookOpen, LogOut, User, GraduationCap, LayoutDashboard, Settings, Sparkles, Target } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar-adapter";
import { useUser, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export function GameNavbar() {
  const { institutionName, institutionLogo } = useBranding();
  const { user, firestore, auth } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const userDocRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, 'users', user.uid);
  }, [firestore, user]);

  const { data: userData } = useDoc(userDocRef);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/auth/login');
  };

  const isAdmin = userData?.role === 'admin';

  return (
    <nav className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b-2 border-primary/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-primary group-hover:glow-primary transition-all bg-white flex items-center justify-center shadow-sm">
            {institutionLogo ? (
              <Image 
                src={institutionLogo} 
                alt={institutionName} 
                fill 
                className="object-contain p-1"
              />
            ) : (
              <GraduationCap className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="hidden sm:block">
            <h1 className="font-headline font-bold text-lg leading-tight text-primary uppercase tracking-tighter">
              {institutionName}
            </h1>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest italic leading-none">Intelligence Hub</p>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          <NavLink href="/dashboard" active={pathname === '/dashboard'} icon={<Home className="w-4 h-4" />} label="Inicio" />
          <NavLink href="/practice" active={pathname?.startsWith('/practice')} icon={<BookOpen className="w-4 h-4" />} label="Entrenar" />
          <NavLink href="/exams" active={pathname?.startsWith('/exams')} icon={<Target className="w-4 h-4" />} label="Simulacros" />
          {isAdmin && (
             <NavLink 
               href="/admin/branding" 
               active={pathname === '/admin/branding'} 
               icon={<Settings className="w-4 h-4 text-accent" />} 
               label="Personalizar" 
               isSpecial
             />
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-primary/5 px-4 py-1.5 rounded-full border-2 border-primary/20 shadow-sm">
            <Trophy className="w-4 h-4 text-accent mr-2" />
            <span className="font-black text-primary text-sm tabular-nums">
              {userData?.currentPoints ?? 0} <span className="text-[10px] opacity-60 ml-1 uppercase">XP</span>
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full border-2 border-primary p-0 overflow-hidden ring-offset-background transition-all hover:scale-110 shadow-lg">
                <Avatar className="h-full w-full">
                  <AvatarImage src={user?.photoURL || ""} />
                  <AvatarFallback className="bg-primary text-white font-black uppercase">
                    {(userData?.displayName || user?.displayName || user?.email || "?")[0]}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 p-2 bg-card border-2 border-primary/10 shadow-2xl" align="end">
              <DropdownMenuLabel className="font-normal mb-2">
                <div className="flex flex-col space-y-1 p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-black leading-none uppercase tracking-tight text-primary truncate">
                    {userData?.displayName || user?.displayName || 'Héroe'}
                  </p>
                  <p className="text-[9px] font-bold leading-none text-muted-foreground uppercase tracking-widest truncate">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer focus:bg-primary/5 rounded-lg py-2.5">
                <Link href="/profile" className="flex items-center w-full">
                  <User className="mr-3 h-4 w-4 text-primary" />
                  <span className="font-black uppercase text-[10px] tracking-widest">Mi Perfil / Códigos</span>
                </Link>
              </DropdownMenuItem>
              
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer focus:bg-primary/5 rounded-lg py-2.5 text-primary">
                    <Link href="/admin/dashboard" className="flex items-center w-full">
                      <LayoutDashboard className="mr-3 h-4 w-4" />
                      <span className="font-black uppercase text-[10px] tracking-widest">Cuartel General</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer focus:bg-accent/5 rounded-lg py-2.5 text-accent">
                    <Link href="/admin/branding" className="flex items-center w-full">
                      <Sparkles className="mr-3 h-4 w-4" />
                      <span className="font-black uppercase text-[10px] tracking-widest">Cargar Contenido</span>
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:bg-destructive/5 rounded-lg py-2.5">
                <LogOut className="mr-3 h-4 w-4" />
                <span className="font-black uppercase text-[10px] tracking-widest">Finalizar Misión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, icon, label, active, isSpecial = false }: { href: string; icon: React.ReactNode; label: string; active?: boolean; isSpecial?: boolean }) {
  return (
    <Link 
      href={href} 
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all uppercase tracking-wider
        ${active ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:text-primary hover:bg-primary/5'}
        ${isSpecial ? 'border border-accent/20 hover:bg-accent/10' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
