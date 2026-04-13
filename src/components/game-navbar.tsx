
"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useBranding } from '@/components/branding-provider';
import { Button } from '@/components/ui/button';
import { Trophy, Home, BookOpen, Target, Settings, LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function GameNavbar() {
  const { institutionName, institutionLogo } = useBranding();

  return (
    <nav className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b-2 border-primary/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-primary group-hover:glow-primary transition-all">
            <Image 
              src={institutionLogo} 
              alt={institutionName} 
              fill 
              className="object-cover"
              data-ai-hint="institution logo"
            />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-headline font-bold text-lg leading-tight text-primary uppercase tracking-tighter">
              {institutionName}
            </h1>
            <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">Entrenador Saber 11</p>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          <NavLink href="/dashboard" icon={<Home className="w-4 h-4" />} label="Inicio" />
          <NavLink href="/practice" icon={<BookOpen className="w-4 h-4" />} label="Práctica" />
          <NavLink href="/simulations" icon={<Target className="w-4 h-4" />} label="Simulacros" />
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center bg-muted px-3 py-1 rounded-full border border-primary/20">
            <Trophy className="w-4 h-4 text-accent mr-2" />
            <span className="font-bold text-primary">1,250 <span className="text-[10px] opacity-70">PTS</span></span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full border-2 border-primary p-0">
                <Avatar className="h-full w-full">
                  <AvatarImage src="https://picsum.photos/seed/user1/40/40" />
                  <AvatarFallback>NB</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 p-2 bg-card border-2 border-primary/10 shadow-xl" align="end">
              <DropdownMenuLabel className="font-normal mb-2">
                <div className="flex flex-col space-y-1 p-2 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-black leading-none uppercase tracking-tight">Estudiante Héroe</p>
                  <p className="text-[10px] font-bold leading-none text-muted-foreground uppercase tracking-widest">estudiante@academia.edu.co</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/profile" className="flex items-center w-full">
                  <User className="mr-2 h-4 w-4" />
                  <span className="font-bold uppercase text-[10px] tracking-widest">Mi Perfil y Acceso Premium</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer text-accent">
                <Link href="/admin/branding" className="flex items-center w-full">
                  <Settings className="mr-2 h-4 w-4" />
                  <span className="font-bold uppercase text-[10px] tracking-widest">Panel de Administración</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer text-destructive">
                <Link href="/auth/login" className="flex items-center w-full">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span className="font-bold uppercase text-[10px] tracking-widest">Cerrar Sesión</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link 
      href={href} 
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all uppercase tracking-wider"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
