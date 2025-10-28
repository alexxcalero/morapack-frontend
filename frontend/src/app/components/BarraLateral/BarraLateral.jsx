'use client';
import { Box, List, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import FlightIcon from '@mui/icons-material/Flight';
import PeopleIcon from '@mui/icons-material/People';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import MonitorIcon from '@mui/icons-material/Monitor';
import ScienceIcon from '@mui/icons-material/Science';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import LogoutIcon from '@mui/icons-material/Logout';
import LocationCityIcon from '@mui/icons-material/LocationCity'; 
import { useRouter } from 'next/navigation';

const menuItems = [
  { label: 'Aeropuertos', icon: <LocationCityIcon />, path: '/aeropuertos' },
  { label: 'Vuelos', icon: <FlightIcon />, path: '/vuelos' },
  { label: 'Clientes', icon: <PeopleIcon />, path: '/clientes' },
  { label: 'Envíos', icon: <LocalShippingIcon />, path: '/envios' },
  { label: 'Monitoreo online', icon: <MonitorIcon />, path: '/' },
  { label: 'Simulación Semanal', icon: <ScienceIcon />, path: '/simulacion-semanal' },
  { label: 'Simulación Colapso', icon: <FactCheckIcon />, path: '/simulacion-colapso' },
];

export default function BarraLateral() {
  const router = useRouter();

  return (
    <Box
      sx={{
        width: 240,
        height: '100vh',
        bgcolor: '#1976d2',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        pt: 2,
      }}
    >
      <List>
        {menuItems.map(({ label, icon, path }) => (
          <ListItemButton
            key={label}
            onClick={() => {
              router.push(path);
            }}
            sx={{
              color: 'white',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
            }}
          >
            <ListItemIcon sx={{ color: 'white' }}>{icon}</ListItemIcon>
            <ListItemText sx={{ fontFamily: 'Jockey One, sans-serif' }} primary={label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
