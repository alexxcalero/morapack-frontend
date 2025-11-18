'use client'
import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import AccountCircle from '@mui/icons-material/AccountCircle';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import Button from '@mui/material/Button';
import Link from 'next/link';

export default function Cabecera() {
  const [auth, setAuth] = React.useState(true);
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ fontFamily: 'Jockey One, sans-serif', mr: 3 }}>
            MoraPack
          </Typography>

          {/* Enlaces de navegación */}
          <Box sx={{ flexGrow: 1, display: 'flex', gap: 2 }}>
            <Link href="/simulacion-dia">
              <Button color="inherit" sx={{ textTransform: 'none', fontWeight: 600 }}>
                Monitoreo en tiempo real
              </Button>
            </Link>

            <Link href="/simulacion-semanal">
              <Button color="inherit" sx={{ textTransform: 'none', fontWeight: 600 }}>
                Simulación semanal
              </Button>
            </Link>

            <Link href="/simulacion-colapso">
              <Button color="inherit" sx={{ textTransform: 'none', fontWeight: 600 }}>
                Simulación colapso
              </Button>
            </Link>
          </Box>

          {auth && (
            <div>
              <IconButton
                size="large"
                aria-label="account of current user"
                aria-controls="menu-appbar"
                aria-haspopup="true"
                onClick={handleMenu}
                color="inherit"
              >
                <AccountCircle />
              </IconButton>
              <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                anchorOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
                open={Boolean(anchorEl)}
                onClose={handleClose}
              >
                <MenuItem onClick={handleClose}>Profile</MenuItem>
                <MenuItem onClick={handleClose}>My account</MenuItem>
              </Menu>
            </div>
          )}
        </Toolbar>
      </AppBar>

    </Box>
  );
}