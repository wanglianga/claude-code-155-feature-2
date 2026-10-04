import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const LoginView = () => import('../views/LoginView.vue')
const MemberHome = () => import('../views/member/MemberHome.vue')
const BookExperience = () => import('../views/member/BookExperience.vue')
const MemberRecords = () => import('../views/member/MemberRecords.vue')
const MemberRequests = () => import('../views/member/MemberRequests.vue')
const CoachWeek = () => import('../views/coach/CoachWeek.vue')
const CoachMember = () => import('../views/coach/CoachMember.vue')
const CoachTransfers = () => import('../views/coach/CoachTransfers.vue')
const SessionRecord = () => import('../views/coach/SessionRecord.vue')
const AssessmentForm = () => import('../views/coach/AssessmentForm.vue')
const ConsultantDashboard = () => import('../views/consultant/ConsultantDashboard.vue')
const ArrangeExperience = () => import('../views/consultant/ArrangeExperience.vue')
const TicketsBoard = () => import('../views/consultant/TicketsBoard.vue')
const TransferBoard = () => import('../views/consultant/TransferBoard.vue')
const Member360 = () => import('../views/consultant/Member360.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/member', component: MemberHome, meta: { role: 'member' } },
    { path: '/member/book', component: BookExperience, meta: { role: 'member' } },
    { path: '/member/records', component: MemberRecords, meta: { role: 'member' } },
    { path: '/member/requests', component: MemberRequests, meta: { role: 'member' } },
    { path: '/coach', component: CoachWeek, meta: { role: 'coach' } },
    { path: '/coach/transfers', component: CoachTransfers, meta: { role: 'coach' } },
    { path: '/coach/member/:id', component: CoachMember, meta: { role: 'coach' } },
    { path: '/coach/session/:id', component: SessionRecord, meta: { role: 'coach' } },
    { path: '/coach/assess/:bookingId', component: AssessmentForm, meta: { role: 'coach' } },
    { path: '/consultant', component: ConsultantDashboard, meta: { role: 'consultant' } },
    { path: '/consultant/arrange', component: ArrangeExperience, meta: { role: 'consultant' } },
    { path: '/consultant/tickets', component: TicketsBoard, meta: { role: 'consultant' } },
    { path: '/consultant/transfers', component: TransferBoard, meta: { role: 'consultant' } },
    { path: '/consultant/member/:id', component: Member360, meta: { role: 'consultant' } },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.isLoggedIn && to.path !== '/login') return '/login'
  const need = to.meta.role as string | undefined
  if (need && auth.role !== need) {
    // 已登录但角色不符，回各自首页
    if (auth.role === 'member') return '/member'
    if (auth.role === 'coach') return '/coach'
    if (auth.role === 'consultant') return '/consultant'
    return '/login'
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    if (auth.role === 'member') return '/member'
    if (auth.role === 'coach') return '/coach'
    if (auth.role === 'consultant') return '/consultant'
  }
  return true
})
