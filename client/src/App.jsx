import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import CapsuleListPage from './pages/CapsuleListPage.jsx';
import CapsuleDetailPage from './pages/CapsuleDetailPage.jsx';
import CreateCapsulePage from './pages/CreateCapsulePage.jsx';

const router = createBrowserRouter([
	{
		path: '/',
		element: <Layout />,
		children: [
			{
				index: true,
				element: (
					<RequireAuth>
						<CapsuleListPage />
					</RequireAuth>
				),
			},
			{
				path: 'capsules/:capsuleId',
				element: (
					<RequireAuth>
						<CapsuleDetailPage />
					</RequireAuth>
				),
			},
			{
				path: 'create',
				element: (
					<RequireAuth>
						<CreateCapsulePage />
					</RequireAuth>
				),
			},
		],
	},
]);

function App() {
	return <RouterProvider router={router} />;
}

export default App;
