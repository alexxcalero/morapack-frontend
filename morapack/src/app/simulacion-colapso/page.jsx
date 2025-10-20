import dynamic from 'next/dynamic';

const PantallaPrincipalColapso = dynamic(() => import('../components/PantallaPrincipalColapso'), {ss: false});

export default function SimulacionPage() {
	return <PantallaPrincipalColapso />;
}
