import dynamic from 'next/dynamic';

const PantallaPrincipalDiaria = dynamic(() => import('../components/PantallaPrincipalDiaria'), {ss: false});

export default function SimulacionPage() {
	return <PantallaPrincipalDiaria />;
}
