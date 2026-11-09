import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';
export type AuthUser={id:string;username:string;email:string;role:string;status:string};
@Injectable() export class AuthGuard implements CanActivate { constructor(private jwt:JwtService, private db:PrismaService){} async canActivate(ctx:ExecutionContext){ const req=ctx.switchToHttp().getRequest(); const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):req.cookies?.sw_session; if(!token) throw new UnauthorizedException('Sign in required'); try { const p=await this.jwt.verifyAsync(token); const u=await this.db.user.findUnique({where:{id:p.sub},select:{id:true,username:true,email:true,role:true,status:true,passwordChangedAt:true}}); if(!u||u.status!=='ACTIVE'||(u.passwordChangedAt&&p.iat*1000<u.passwordChangedAt.getTime())) throw new Error(); req.user={id:u.id,username:u.username,email:u.email,role:u.role,status:u.status}; return true; } catch { throw new UnauthorizedException('Invalid or expired session'); } } }
export const CurrentUser=createParamDecorator((_d,ctx)=>ctx.switchToHttp().getRequest().user);
export function isAdmin(user:AuthUser){return ['ADMIN','SUPERVISOR'].includes(user.role);}

@Injectable() export class OptionalAuthGuard extends AuthGuard { constructor(jwt:JwtService,db:PrismaService){super(jwt,db);} async canActivate(ctx:ExecutionContext){const req=ctx.switchToHttp().getRequest();const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):req.cookies?.sw_session;if(!token)return true;return super.canActivate(ctx);}}
