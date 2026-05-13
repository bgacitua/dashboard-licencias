import React, { useState, useCallback } from 'react';
import Sidebar from './Sidebar';

const STORAGE_KEY = 'hr-sidebar-collapsed';

const SidebarLayout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  const handleToggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 font-['Public_Sans']">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <div
        data-sidebar-content
        className="transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: collapsed ? '4rem' : '16rem' }}
      >
        {children}
      </div>
    </div>
  );
};

export default SidebarLayout;
