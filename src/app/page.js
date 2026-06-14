'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchUserGroups, createGroup, calculateBalancesAndDebts, deleteGroup } from '@/lib/api';
import { Plus, LogOut, Users, User, ArrowUpRight, ArrowDownLeft, Scale, RefreshCw, FileSpreadsheet, Trash2 } from 'lucide-react';
import Link from 'next/link';
import CsvImporter from '@/components/CsvImporter';

export default function Dashboard() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState([]);
  const [groupBalances, setGroupBalances] = useState({}); // groupId -> { consolidated, INR, USD }
  const [dataLoading, setDataLoading] = useState(true);
  
  // Create group modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // CSV Import state
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const loadData = async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      const userGroups = await fetchUserGroups(user.id);
      setGroups(userGroups);

      // Fetch balances for each group
      const balances = {};
      await Promise.all(
        userGroups.map(async (g) => {
          try {
            const groupData = await calculateBalancesAndDebts(g.id);
            balances[g.id] = {
              consolidated: groupData.netBalances[user.id] || 0,
              INR: groupData.netBalancesByCurrency?.INR?.[user.id] || 0,
              USD: groupData.netBalancesByCurrency?.USD?.[user.id] || 0,
            };
          } catch (err) {
            console.error(`Error calculating balance for group ${g.id}:`, err);
            balances[g.id] = { consolidated: 0, INR: 0, USD: 0 };
          }
        })
      );
      setGroupBalances(balances);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setModalError('');
    if (!newGroupName.trim()) {
      setModalError('Group name is required');
      return;
    }

    setModalLoading(true);
    try {
      const group = await createGroup(newGroupName.trim(), user.id);
      setIsModalOpen(false);
      setNewGroupName('');
      // Reload groups list
      await loadData();
      router.push(`/groups/${group.id}`);
    } catch (err) {
      setModalError(err.message || 'Failed to create group');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteGroup = async (e, groupId, groupName) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${groupName}"? All transaction logs, splits, and chat comments will be permanently erased.`
    );
    if (!confirmDelete) return;

    try {
      await deleteGroup(groupId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete group.');
    }
  };

  // Calculate overall balances
  let totalOwedINR = 0;
  let totalOweINR = 0;
  let totalOwedUSD = 0;
  let totalOweUSD = 0;
  
  Object.values(groupBalances).forEach((bal) => {
    // INR
    const inr = bal.INR || 0;
    if (inr > 0) {
      totalOwedINR += inr;
    } else if (inr < 0) {
      totalOweINR += Math.abs(inr);
    }

    // USD
    const usd = bal.USD || 0;
    if (usd > 0) {
      totalOwedUSD += usd;
    } else if (usd < 0) {
      totalOweUSD += Math.abs(usd);
    }
  });

  const overallBalanceINR = totalOwedINR - totalOweINR;
  const overallBalanceUSD = totalOwedUSD - totalOweUSD;

  if (loading || !user) {
    return (
      <div className="flex-1 flex justify-center items-center min-h-screen bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="text-slate-400 text-sm">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      {/* Navbar */}
      <header className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md">
              <span className="font-extrabold text-lg">S</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Splitwise</h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-slate-800/50 rounded-xl border border-slate-700/50">
              <User className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-slate-200">{profile?.name || user.email}</span>
            </div>
            
            <button
              onClick={() => signOut()}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent hover:border-slate-800 transition-all text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Profile details header card on mobile */}
        <div className="md:hidden flex items-center space-x-3 p-4 bg-slate-900/50 border border-slate-850 rounded-2xl">
          <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold">
            {(profile?.name || user.email)[0].toUpperCase()}
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{profile?.name || 'User'}</h3>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>

        {/* 1. Balances Summary Panel */}
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute top-[-40%] right-[-10%] h-[180px] w-[180px] rounded-full bg-emerald-500/10 blur-[60px] pointer-events-none"></div>
          <div className="absolute bottom-[-30%] left-[5%] h-[140px] w-[140px] rounded-full bg-indigo-500/10 blur-[50px] pointer-events-none"></div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xs font-semibold text-slate-450 uppercase tracking-wider">Overall Balance</h2>
                <div className="flex flex-col gap-2 mt-2">
                  <div className={`text-2xl md:text-3xl font-extrabold tracking-tight ${
                    overallBalanceINR > 0.01 
                      ? 'text-emerald-400' 
                      : overallBalanceINR < -0.01 
                      ? 'text-rose-400' 
                      : 'text-slate-300'
                  }`}>
                    {overallBalanceINR > 0.01 ? '+' : ''}
                    ₹{overallBalanceINR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-semibold text-slate-550">INR</span>
                  </div>
                  <div className={`text-2xl md:text-3xl font-extrabold tracking-tight ${
                    overallBalanceUSD > 0.01 
                      ? 'text-emerald-400' 
                      : overallBalanceUSD < -0.01 
                      ? 'text-rose-400' 
                      : 'text-slate-300'
                  }`}>
                    {overallBalanceUSD > 0.01 ? '+' : ''}
                    ${overallBalanceUSD.toFixed(2)} <span className="text-xs font-semibold text-slate-550">USD</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">Net balances separated by currency across all your groups.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:flex items-center gap-6 md:gap-8 border-t md:border-t-0 md:border-l border-slate-800 pt-6 md:pt-0 md:pl-8">
              <div className="space-y-2">
                <div className="flex items-center space-x-1 text-slate-455 text-xs font-semibold uppercase tracking-wider">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-450" />
                  <span>You are owed</span>
                </div>
                <div className="space-y-1">
                  <p className="text-base md:text-lg font-bold text-emerald-400">₹{totalOwedINR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-base md:text-lg font-bold text-emerald-400">${totalOwedUSD.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-1 text-slate-455 text-xs font-semibold uppercase tracking-wider">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-rose-455" />
                  <span>You owe</span>
                </div>
                <div className="space-y-1">
                  <p className="text-base md:text-lg font-bold text-rose-450">₹{totalOweINR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-base md:text-lg font-bold text-rose-450">${totalOweUSD.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. Group List Header */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Your Groups</h2>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={loadData}
                disabled={dataLoading}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-850 disabled:opacity-50 transition-all"
                title="Refresh balances"
              >
                <RefreshCw className={`h-4 w-4 ${dataLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setIsCsvImportOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 shadow-md font-semibold text-sm transition-all"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-450" />
                <span>Import CSV</span>
              </button>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 shadow-md font-semibold text-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                <span>Create Group</span>
              </button>
            </div>
          </div>

          {/* Group Grid / List */}
          {dataLoading && groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-850 rounded-2xl">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500 mb-3"></div>
              <p className="text-slate-400 text-xs">Loading groups...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900/30 border border-slate-850 rounded-2xl text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">No groups yet</h3>
                <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">Create a group to start splitting rent, dinner, or travel bills with friends.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 font-semibold text-xs transition-all"
              >
                Create your first group
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {groups.map((group) => {
                const balance = groupBalances[group.id] || { INR: 0, USD: 0 };
                return (
                  <div key={group.id} className="relative group/card">
                    <Link
                      href={`/groups/${group.id}`}
                      className="group flex items-center justify-between p-6 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-850/60 hover:border-emerald-500/30 rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-emerald-500/5 pr-14"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-center text-slate-350 group-hover:bg-gradient-to-tr group-hover:from-emerald-500 group-hover:to-teal-400 group-hover:text-slate-950 transition-all duration-300 shadow-md">
                          <Users className="h-5.5 w-5.5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base group-hover:text-emerald-450 transition-colors">
                            {group.name}
                          </h3>
                          <p className="text-slate-500 text-xs mt-0.5">
                            Created {new Date(group.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex flex-col gap-1">
                        {/* Display INR */}
                        {(balance.INR > 0.01 || balance.INR < -0.01) && (
                          <div>
                            <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-550">
                              {balance.INR > 0 ? 'owed' : 'owe'} (INR)
                            </p>
                            <p className={`font-extrabold text-xs mt-0.5 ${balance.INR > 0 ? 'text-emerald-450' : 'text-rose-455'}`}>
                              ₹{Math.abs(balance.INR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        )}
                        
                        {/* Display USD */}
                        {(balance.USD > 0.01 || balance.USD < -0.01) && (
                          <div>
                            <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-550">
                              {balance.USD > 0 ? 'owed' : 'owe'} (USD)
                            </p>
                            <p className={`font-extrabold text-xs mt-0.5 ${balance.USD > 0 ? 'text-emerald-455' : 'text-rose-455'}`}>
                              ${Math.abs(balance.USD).toFixed(2)}
                            </p>
                          </div>
                        )}

                        {/* Settled up */}
                        {Math.abs(balance.INR || 0) <= 0.01 && Math.abs(balance.USD || 0) <= 0.01 && (
                          <div>
                            <p className="text-[9px] uppercase font-semibold tracking-wider text-slate-650">settled up</p>
                            <p className="font-bold text-slate-550 text-xs mt-0.5">₹0.00</p>
                          </div>
                        )}
                      </div>
                    </Link>

                    <button
                      onClick={(e) => handleDeleteGroup(e, group.id, group.name)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-red-950/20 hover:bg-red-950/60 border border-red-900/30 hover:border-red-900 text-rose-455 hover:text-rose-400 transition-all opacity-100 md:opacity-0 md:group-hover/card:opacity-100 focus:opacity-100 z-10"
                      title={`Delete ${group.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 3. Create Group Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create New Group</h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setNewGroupName('');
                  setModalError('');
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-900 text-red-200 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label htmlFor="groupName" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Group Name
                </label>
                <input
                  id="groupName"
                  type="text"
                  required
                  placeholder="e.g. Apartment roommates, Europe trip"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setNewGroupName('');
                    setModalError('');
                  }}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-all text-sm font-semibold border border-transparent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-450 hover:to-teal-450 text-slate-950 disabled:opacity-50 transition-all text-sm font-bold shadow-md shadow-emerald-500/10"
                >
                  {modalLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {isCsvImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-450" />
                  <span>CSV Expense Ingestion Wizard</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Parse, sanitise, and ingest your historical expense logs</p>
              </div>
              <button
                onClick={() => {
                  setIsCsvImportOpen(false);
                }}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg border border-slate-800"
              >
                ✕
              </button>
            </div>

            <CsvImporter 
              currentUserId={user.id} 
              onImportSuccess={(newGroupId) => {
                setIsCsvImportOpen(false);
                loadData();
                router.push(`/groups/${newGroupId}`);
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
