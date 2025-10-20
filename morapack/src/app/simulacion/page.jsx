import dynamic from 'next/dynamic';

const PantallaPrincipal = dynamic(() => import('../components/PantallaPrincipal'), {ss: false});

export default function SimulacionPage() {
	return <PantallaPrincipal />;
}
