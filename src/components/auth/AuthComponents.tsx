"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogIn, LogOut } from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';

export function AuthButton() {
    const { data: session, status } = useSession();
    const isLoading = status === 'loading';

    if (isLoading) {
        return <Button variant="outline" size="sm" disabled>Loading...</Button>;
    }

    if (!session) {
        return (
            <Button variant="outline" size="sm" onClick={() => signIn('google')}>
                <LogIn className="mr-2 h-4 w-4" />
                Login dengan Google
            </Button>
        );
    }

    const userName = session.user?.name || 'User';
    const userImage = session.user?.image;
    const userInitial = userName?.charAt(0).toUpperCase() || 'U';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                        {userImage && <AvatarImage src={userImage} alt={userName} />}
                        <AvatarFallback>{userInitial}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{userName}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {session.user?.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Add links to dashboard, settings etc. if needed */}
                {/* <DropdownMenuItem> */}
                {/*     <UserIcon className="mr-2 h-4 w-4" /> */}
                {/*     <span>Profil</span> */}
                {/* </DropdownMenuItem> */}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// Optional: Simple UserAvatar component if needed separately
export function UserAvatar() {
    const { data: session, status } = useSession();

    if (status !== 'authenticated' || !session?.user) {
        return null; // Or return a placeholder avatar
    }

    const userName = session.user.name || 'User';
    const userImage = session.user.image;
    const userInitial = userName?.charAt(0).toUpperCase() || 'U';

    return (
        <Avatar>
            {userImage && <AvatarImage src={userImage} alt={userName} />}
            <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
    );
} 