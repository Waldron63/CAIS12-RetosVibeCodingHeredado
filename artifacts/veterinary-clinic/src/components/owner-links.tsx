import { UserRound } from 'lucide-react';
import { Link } from 'wouter';
import type { Owner } from '@workspace/api-client-react';

export function OwnerLinks({ owners, showPhone = false, testIdPrefix }: {
  owners: Owner[]; showPhone?: boolean; testIdPrefix: string;
}) {
  return (
    <ul className="owner-chips">
      {owners.map((owner) => (
        <li key={owner.id}>
          <Link href={`/owners/${owner.id}`} className="owner-chip" title={`Ver las mascotas de ${owner.name}`} data-testid={`${testIdPrefix}-${owner.id}`}>
            <UserRound size={12} />{owner.name}{showPhone && <small>{owner.phone}</small>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
