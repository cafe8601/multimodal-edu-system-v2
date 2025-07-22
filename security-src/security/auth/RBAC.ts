export interface Permission {
  resource: string;
  action: string;
}

export interface Role {
  name: string;
  permissions: Permission[];
}

export class RBAC {
  private roles: Map<string, Role>;

  constructor() {
    this.roles = new Map();
    this.initializeDefaultRoles();
  }

  private initializeDefaultRoles(): void {
    // Student role
    this.addRole({
      name: 'student',
      permissions: [
        { resource: 'session', action: 'create' },
        { resource: 'session', action: 'read' },
        { resource: 'session', action: 'join' },
        { resource: 'content', action: 'read' },
        { resource: 'analytics', action: 'read:own' },
      ],
    });

    // Teacher role
    this.addRole({
      name: 'teacher',
      permissions: [
        { resource: 'session', action: '*' },
        { resource: 'content', action: '*' },
        { resource: 'analytics', action: 'read' },
        { resource: 'student', action: 'read' },
        { resource: 'assessment', action: '*' },
      ],
    });

    // Admin role
    this.addRole({
      name: 'admin',
      permissions: [
        { resource: '*', action: '*' },
      ],
    });
  }

  addRole(role: Role): void {
    this.roles.set(role.name, role);
  }

  hasPermission(
    userRoles: string[],
    resource: string,
    action: string
  ): boolean {
    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);
      if (\!role) continue;

      for (const permission of role.permissions) {
        if (
          (permission.resource === '*' || permission.resource === resource) &&
          (permission.action === '*' || permission.action === action)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  getRolePermissions(roleName: string): Permission[] {
    const role = this.roles.get(roleName);
    return role ? [...role.permissions] : [];
  }
}
